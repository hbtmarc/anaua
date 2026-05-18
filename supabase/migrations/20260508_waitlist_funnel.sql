-- =============================================================================
-- Migration: waitlist_funnel
-- Adds operational columns to waitlist_entries, waitlist_entry_logs table,
-- convert_waitlist_to_reservation RPC, and RLS policies.
-- Run in Supabase SQL Editor (once).
-- =============================================================================

-- ─── 1. waitlist_entries: add missing operational columns ────────────────────
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS status                   text NOT NULL DEFAULT 'pending';
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS source                   text;
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS notes                    text;
-- Desired departure set by the visitor when filling the form
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS departure_id             uuid REFERENCES departures(id);
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS pickup_point_id          uuid REFERENCES boarding_points(id);
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS pickup_point_label       text;
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS pickup_time              text;
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS preferred_departure_id   uuid REFERENCES departures(id);
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS offered_departure_id     uuid REFERENCES departures(id);
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS converted_reservation_id uuid REFERENCES reservations(id);
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS contacted_at             timestamptz;
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS offered_at               timestamptz;
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS converted_at             timestamptz;
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS discarded_at             timestamptz;
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS discard_reason           text;
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS last_contact_channel     text;
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS last_contact_message     text;

-- Widen / ensure status constraint
ALTER TABLE waitlist_entries DROP CONSTRAINT IF EXISTS waitlist_entries_status_check;
ALTER TABLE waitlist_entries ADD CONSTRAINT waitlist_entries_status_check
  CHECK (status IN ('pending','contacted','offered','converted','discarded'));

-- ─── 2. waitlist_entry_logs: audit / history ─────────────────────────────────
CREATE TABLE IF NOT EXISTS waitlist_entry_logs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id   uuid        NOT NULL REFERENCES waitlist_entries(id) ON DELETE CASCADE,
  action     text        NOT NULL,   -- 'contacted','offered_departure','offered_experience','converted','discarded','note'
  channel    text,                   -- 'whatsapp','email','phone','system'
  message    text,
  metadata   jsonb,
  created_by uuid        REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 3. RLS — waitlist_entries ────────────────────────────────────────────────
ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wl_entries_public_insert" ON waitlist_entries;
DROP POLICY IF EXISTS "wl_entries_admin"          ON waitlist_entries;

-- Public/anonymous can insert (from the booking/interest form on the site)
CREATE POLICY "wl_entries_public_insert" ON waitlist_entries
  FOR INSERT
  WITH CHECK (true);

-- Admin / operator: full access
CREATE POLICY "wl_entries_admin" ON waitlist_entries
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','operator'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','operator'))
  );

-- ─── 4. RLS — waitlist_entry_logs ─────────────────────────────────────────────
ALTER TABLE waitlist_entry_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wl_logs_admin" ON waitlist_entry_logs;

CREATE POLICY "wl_logs_admin" ON waitlist_entry_logs
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','operator'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','operator'))
  );

-- Grants for authenticated users (admins/operators)
GRANT SELECT, INSERT, UPDATE ON waitlist_entries    TO authenticated;
GRANT SELECT, INSERT          ON waitlist_entry_logs TO authenticated;

-- ─── 5. RPC: convert_waitlist_to_reservation ─────────────────────────────────
-- Atomically reserves a departure for a waitlist entry.
-- Delegates capacity logic/insertion to reserve_departure; then updates the
-- waitlist_entry and writes an audit log in the same transaction.
CREATE OR REPLACE FUNCTION convert_waitlist_to_reservation(
  p_entry_id          uuid,
  p_departure_id      uuid,
  p_experience_id     uuid,
  p_boarding_point_id uuid    DEFAULT NULL,
  p_customer_name     text    DEFAULT NULL,
  p_customer_email    text    DEFAULT NULL,
  p_customer_phone    text    DEFAULT NULL,
  p_payment_method    text    DEFAULT NULL,
  p_total_amount      numeric DEFAULT 0,
  p_amount_paid       numeric DEFAULT 0,
  p_notes             text    DEFAULT NULL,
  p_participants      jsonb   DEFAULT '[]'::jsonb,
  p_operator_id       uuid    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result         jsonb;
  v_reservation_id uuid;
BEGIN
  -- Guard: entry must exist
  IF NOT EXISTS (SELECT 1 FROM waitlist_entries WHERE id = p_entry_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Entrada de lista de espera não encontrada.');
  END IF;

  -- Guard: not already converted
  IF EXISTS (SELECT 1 FROM waitlist_entries WHERE id = p_entry_id AND status = 'converted') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta entrada já foi convertida em reserva.');
  END IF;

  -- Guard: must have at least one participant
  IF jsonb_array_length(p_participants) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Informe pelo menos um participante.');
  END IF;

  -- Delegate to reserve_departure (handles row lock + capacity + insertion)
  SELECT reserve_departure(
    p_departure_id,
    p_experience_id,
    p_operator_id,
    p_customer_name,
    p_customer_email,
    p_customer_phone,
    p_boarding_point_id,
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

  -- Update the waitlist entry
  UPDATE waitlist_entries SET
    status                   = 'converted',
    converted_reservation_id = v_reservation_id,
    converted_at             = now()
  WHERE id = p_entry_id;

  -- Audit log
  INSERT INTO waitlist_entry_logs (entry_id, action, channel, message, metadata, created_by)
  VALUES (
    p_entry_id,
    'converted',
    'system',
    'Convertido em reserva via backoffice.',
    jsonb_build_object(
      'reservation_id', v_reservation_id,
      'departure_id',   p_departure_id
    ),
    p_operator_id
  );

  RETURN jsonb_build_object(
    'ok',             true,
    'reservation_id', v_reservation_id,
    'new_capacity',   v_result->'new_capacity',
    'sold_out',       v_result->'sold_out'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION convert_waitlist_to_reservation TO authenticated;

-- ─── 6. Reload PostgREST schema cache ─────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
