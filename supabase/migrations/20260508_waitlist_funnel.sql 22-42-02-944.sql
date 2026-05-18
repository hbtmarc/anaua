-- =============================================================================
--  MIGRAÇÃO: Lista de espera — funil operacional completo
--  Arquivo : 20260508_waitlist_funnel.sql
--  Aplicar : Supabase Dashboard → SQL Editor → Run
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TABELA: waitlist_entries — colunas operacionais
-- -----------------------------------------------------------------------------

-- Colunas base (já devem existir; IF NOT EXISTS protege replicações)
ALTER TABLE waitlist_entries
  ADD COLUMN IF NOT EXISTS status               text    NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS source               text,
  ADD COLUMN IF NOT EXISTS notes                text,

  -- Saída desejada (FK nomeada para evitar ambiguidade no PostgREST)
  ADD COLUMN IF NOT EXISTS departure_id         uuid,
  ADD COLUMN IF NOT EXISTS pickup_point_id      uuid,
  ADD COLUMN IF NOT EXISTS pickup_point_label   text,
  ADD COLUMN IF NOT EXISTS pickup_time          text,

  -- Funil
  ADD COLUMN IF NOT EXISTS preferred_departure_id   uuid,
  ADD COLUMN IF NOT EXISTS offered_departure_id     uuid,
  ADD COLUMN IF NOT EXISTS converted_reservation_id uuid,

  -- Timestamps de funil
  ADD COLUMN IF NOT EXISTS contacted_at   timestamptz,
  ADD COLUMN IF NOT EXISTS offered_at     timestamptz,
  ADD COLUMN IF NOT EXISTS converted_at   timestamptz,
  ADD COLUMN IF NOT EXISTS discarded_at   timestamptz,
  ADD COLUMN IF NOT EXISTS discard_reason text,

  -- Último contato
  ADD COLUMN IF NOT EXISTS last_contact_channel text,
  ADD COLUMN IF NOT EXISTS last_contact_message text;

-- Restrição CHECK no status
ALTER TABLE waitlist_entries
  DROP CONSTRAINT IF EXISTS waitlist_entries_status_check;
ALTER TABLE waitlist_entries
  ADD CONSTRAINT waitlist_entries_status_check
    CHECK (status IN ('pending','contacted','offered','converted','discarded'));

-- FKs com nomes explícitos (PostgREST usa o nome para desambiguar)
-- departure_id → departures
ALTER TABLE waitlist_entries
  DROP CONSTRAINT IF EXISTS fk_wl_departure;
ALTER TABLE waitlist_entries
  ADD CONSTRAINT fk_wl_departure
    FOREIGN KEY (departure_id) REFERENCES departures(id) ON DELETE SET NULL;

-- pickup_point_id → boarding_points
ALTER TABLE waitlist_entries
  DROP CONSTRAINT IF EXISTS fk_wl_pickup_point;
ALTER TABLE waitlist_entries
  ADD CONSTRAINT fk_wl_pickup_point
    FOREIGN KEY (pickup_point_id) REFERENCES boarding_points(id) ON DELETE SET NULL;

-- preferred_departure_id → departures
ALTER TABLE waitlist_entries
  DROP CONSTRAINT IF EXISTS fk_wl_preferred_departure;
ALTER TABLE waitlist_entries
  ADD CONSTRAINT fk_wl_preferred_departure
    FOREIGN KEY (preferred_departure_id) REFERENCES departures(id) ON DELETE SET NULL;

-- offered_departure_id → departures
ALTER TABLE waitlist_entries
  DROP CONSTRAINT IF EXISTS fk_wl_offered_departure;
ALTER TABLE waitlist_entries
  ADD CONSTRAINT fk_wl_offered_departure
    FOREIGN KEY (offered_departure_id) REFERENCES departures(id) ON DELETE SET NULL;

-- converted_reservation_id → reservations
ALTER TABLE waitlist_entries
  DROP CONSTRAINT IF EXISTS fk_wl_converted_reservation;
ALTER TABLE waitlist_entries
  ADD CONSTRAINT fk_wl_converted_reservation
    FOREIGN KEY (converted_reservation_id) REFERENCES reservations(id) ON DELETE SET NULL;

-- Índices úteis
CREATE INDEX IF NOT EXISTS idx_wl_entries_status      ON waitlist_entries(status);
CREATE INDEX IF NOT EXISTS idx_wl_entries_experience  ON waitlist_entries(experience_id);
CREATE INDEX IF NOT EXISTS idx_wl_entries_departure   ON waitlist_entries(departure_id);
CREATE INDEX IF NOT EXISTS idx_wl_entries_created_at  ON waitlist_entries(created_at DESC);

-- -----------------------------------------------------------------------------
-- 2. TABELA: waitlist_entry_logs — histórico de contatos
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS waitlist_entry_logs (
  id          uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id    uuid            NOT NULL REFERENCES waitlist_entries(id) ON DELETE CASCADE,
  action      text            NOT NULL,   -- contacted | offered_departure | offered_experience | converted | discarded | note
  channel     text,                       -- whatsapp | email | phone | system | manual
  message     text,
  metadata    jsonb           NOT NULL DEFAULT '{}',
  created_by  uuid            REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wl_logs_entry_id   ON waitlist_entry_logs(entry_id);
CREATE INDEX IF NOT EXISTS idx_wl_logs_created_at ON waitlist_entry_logs(created_at DESC);

-- -----------------------------------------------------------------------------
-- 3. RLS — waitlist_entries
-- -----------------------------------------------------------------------------

ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;

-- Admin / operator: acesso total
DROP POLICY IF EXISTS "waitlist_entries: admin full access" ON waitlist_entries;
CREATE POLICY "waitlist_entries: admin full access"
  ON waitlist_entries FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin','operator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin','operator')
    )
  );

-- Público: apenas INSERT (cadastro via formulário do site)
DROP POLICY IF EXISTS "waitlist_entries: public insert" ON waitlist_entries;
CREATE POLICY "waitlist_entries: public insert"
  ON waitlist_entries FOR INSERT
  TO anon
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 4. RLS — waitlist_entry_logs
-- -----------------------------------------------------------------------------

ALTER TABLE waitlist_entry_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "waitlist_entry_logs: admin full access" ON waitlist_entry_logs;
CREATE POLICY "waitlist_entry_logs: admin full access"
  ON waitlist_entry_logs FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin','operator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin','operator')
    )
  );

-- -----------------------------------------------------------------------------
-- 5. GRANTS
-- -----------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON waitlist_entries     TO authenticated;
GRANT SELECT, INSERT         ON waitlist_entry_logs  TO authenticated;
GRANT INSERT                 ON waitlist_entries     TO anon;

-- -----------------------------------------------------------------------------
-- 6. RPC: convert_waitlist_to_reservation
--    Converte uma entrada da lista de espera em reserva real de forma atômica.
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS convert_waitlist_to_reservation(
  uuid, uuid, uuid, uuid, text, text, text,
  text, numeric, numeric, text, jsonb, uuid
);

CREATE OR REPLACE FUNCTION convert_waitlist_to_reservation(
  p_entry_id          uuid,
  p_departure_id      uuid,
  p_experience_id     uuid,
  p_boarding_point_id uuid    DEFAULT NULL,
  p_customer_name     text    DEFAULT '',
  p_customer_email    text    DEFAULT '',
  p_customer_phone    text    DEFAULT '',
  p_payment_method    text    DEFAULT 'pix',
  p_total_amount      numeric DEFAULT 0,
  p_amount_paid       numeric DEFAULT 0,
  p_notes             text    DEFAULT '',
  p_participants      jsonb   DEFAULT '[]',
  p_operator_id       uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation_id uuid;
  v_result         jsonb;
BEGIN
  -- Delega para a função reserve_departure já existente
  SELECT reserve_departure(
    p_departure_id,
    p_experience_id,
    p_boarding_point_id,
    p_customer_name,
    p_customer_email,
    p_customer_phone,
    p_payment_method,
    p_total_amount,
    p_amount_paid,
    p_notes,
    p_participants
  ) INTO v_result;

  IF NOT (v_result->>'ok')::boolean THEN
    RETURN v_result;
  END IF;

  v_reservation_id := (v_result->>'reservation_id')::uuid;

  -- Atualiza a entrada da lista de espera
  UPDATE waitlist_entries
  SET
    status                   = 'converted',
    converted_reservation_id = v_reservation_id,
    converted_at             = now()
  WHERE id = p_entry_id;

  -- Registra no log
  INSERT INTO waitlist_entry_logs (entry_id, action, channel, message, metadata, created_by)
  VALUES (
    p_entry_id,
    'converted',
    'system',
    'Convertido em reserva ' || v_reservation_id,
    jsonb_build_object(
      'reservation_id', v_reservation_id,
      'departure_id',   p_departure_id
    ),
    p_operator_id
  );

  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION convert_waitlist_to_reservation TO authenticated;

-- =============================================================================
-- FIM DA MIGRAÇÃO
-- Verificação rápida:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'waitlist_entries' ORDER BY ordinal_position;
-- =============================================================================
