-- =============================================================================
--  MIGRAÇÃO: Função reserve_departure — parâmetros nomeados
--  Arquivo : 20260508_reserve_departure.sql
--  Aplicar : Supabase Dashboard → SQL Editor → Run
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. FUNÇÃO: reserve_departure (parâmetros nomeados, SECURITY DEFINER)
-- -----------------------------------------------------------------------------

-- Remove versões anteriores com assinaturas diferentes
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig
    FROM pg_proc
    WHERE proname = 'reserve_departure'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END$$;

CREATE OR REPLACE FUNCTION public.reserve_departure(
  p_departure_id      uuid,
  p_experience_id     uuid    DEFAULT NULL,
  p_pickup_point_id   uuid    DEFAULT NULL,
  p_responsible_name  text    DEFAULT '',
  p_responsible_email text    DEFAULT '',
  p_responsible_phone text    DEFAULT '',
  p_payment_method    text    DEFAULT 'pix',
  p_total_amount      numeric DEFAULT 0,
  p_amount_paid       numeric DEFAULT 0,
  p_notes             text    DEFAULT '',
  p_participants      jsonb   DEFAULT '[]',
  p_waitlist_entry_id uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_departure        record;
  v_reservation_id   uuid;
  v_code             text;
  v_occupied         int;
  v_pax_count        int;
  v_participant       jsonb;
  v_reservation_status text := 'confirmed';
BEGIN
  -- ── 1. Busca a saída ──────────────────────────────────────────────────────
  SELECT d.id, d.capacity, d.status, d.experience_id
    INTO v_departure
    FROM departures d
   WHERE d.id = p_departure_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Saída não encontrada.');
  END IF;

  IF v_departure.status IN ('cancelled', 'completed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta saída está ' || v_departure.status || ' e não aceita novas reservas.');
  END IF;

  -- ── 2. Conta ocupação atual ───────────────────────────────────────────────
  SELECT COALESCE(COUNT(p.id), 0)
  INTO v_occupied
  FROM reservations r
  JOIN participants p ON p.reservation_id = r.id
  WHERE r.departure_id = p_departure_id
    AND r.reservation_status NOT IN ('cancelled', 'refunded');

  v_pax_count := jsonb_array_length(p_participants);

  IF v_departure.status = 'sold_out' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta saída está esgotada.');
  END IF;

  -- Capacidade: usa pelo menos 1 se nenhum participante foi informado
  IF v_pax_count = 0 THEN v_pax_count := 1; END IF;

  IF (v_departure.capacity - v_occupied) < v_pax_count THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Capacidade insuficiente. Disponível: ' || (v_departure.capacity - v_occupied) || ', solicitado: ' || v_pax_count
    );
  END IF;

  -- ── 3. Determina status da reserva ───────────────────────────────────────
  IF p_amount_paid >= p_total_amount AND p_total_amount > 0 THEN
    v_reservation_status := 'confirmed';
  ELSIF p_amount_paid > 0 THEN
    v_reservation_status := 'confirmed';
  ELSE
    v_reservation_status := 'pending_payment';
  END IF;

  -- ── 4. Gera código legível ────────────────────────────────────────────────
  v_code := 'RES-' || upper(substring(gen_random_uuid()::text, 1, 6));

  -- ── 5. Cria a reserva ─────────────────────────────────────────────────────
  INSERT INTO reservations (
    departure_id, experience_id, customer_name, customer_email, customer_phone,
    boarding_point_id, payment_method, total_amount, amount_paid,
    notes, reservation_status, code, created_at, updated_at
  )
  VALUES (
    p_departure_id,
    COALESCE(p_experience_id, v_departure.experience_id),
    p_responsible_name,
    p_responsible_email,
    p_responsible_phone,
    p_pickup_point_id,
    p_payment_method,
    p_total_amount,
    p_amount_paid,
    p_notes,
    v_reservation_status,
    v_code,
    now(),
    now()
  )
  RETURNING id INTO v_reservation_id;

  -- ── 6. Cria participantes ─────────────────────────────────────────────────
  IF jsonb_array_length(p_participants) > 0 THEN
    FOR v_participant IN SELECT * FROM jsonb_array_elements(p_participants) LOOP
      INSERT INTO participants (reservation_id, full_name, document_number, profile_type, created_at)
      VALUES (
        v_reservation_id,
        COALESCE(v_participant->>'full_name', p_responsible_name),
        v_participant->>'document_number',
        COALESCE(v_participant->>'profile_type', 'adult'),
        now()
      );
    END LOOP;
  ELSE
    -- Nenhum participante informado: cria one com o responsável
    INSERT INTO participants (reservation_id, full_name, profile_type, created_at)
    VALUES (v_reservation_id, p_responsible_name, 'adult', now());
    v_pax_count := 1;
  END IF;

  -- ── 7. Verifica capacidade e atualiza status da saída ────────────────────
  IF (v_departure.capacity - v_occupied - v_pax_count) <= 0 THEN
    UPDATE departures SET status = 'sold_out', updated_at = now()
    WHERE id = p_departure_id;
  END IF;

  -- ── 8. Atualiza lista de espera (se aplicável) ────────────────────────────
  IF p_waitlist_entry_id IS NOT NULL THEN
    UPDATE waitlist_entries
    SET
      status                   = 'converted',
      converted_reservation_id = v_reservation_id,
      converted_at             = now()
    WHERE id = p_waitlist_entry_id;
  END IF;

  -- ── 9. Retorna resultado ──────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'ok',               true,
    'reservation_id',   v_reservation_id,
    'code',             v_code,
    'status',           v_reservation_status,
    'total_amount',     p_total_amount,
    'amount_paid',      p_amount_paid,
    'departure_id',     p_departure_id
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_departure TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Atualiza convert_waitlist_to_reservation para delegar com nomes explícitos
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig
    FROM pg_proc
    WHERE proname = 'convert_waitlist_to_reservation'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END$$;

CREATE OR REPLACE FUNCTION public.convert_waitlist_to_reservation(
  p_entry_id          uuid,
  p_departure_id      uuid,
  p_experience_id     uuid    DEFAULT NULL,
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
  v_result jsonb;
BEGIN
  SELECT reserve_departure(
    p_departure_id      => p_departure_id,
    p_experience_id     => p_experience_id,
    p_pickup_point_id   => p_boarding_point_id,
    p_responsible_name  => p_customer_name,
    p_responsible_email => p_customer_email,
    p_responsible_phone => p_customer_phone,
    p_payment_method    => p_payment_method,
    p_total_amount      => p_total_amount,
    p_amount_paid       => p_amount_paid,
    p_notes             => p_notes,
    p_participants      => p_participants,
    p_waitlist_entry_id => p_entry_id
  ) INTO v_result;

  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_waitlist_to_reservation TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Força refresh do schema cache do PostgREST
-- -----------------------------------------------------------------------------

SELECT pg_notify('pgrst', 'reload schema');

-- =============================================================================
-- VERIFICAÇÃO RÁPIDA:
--   SELECT proname, proargnames FROM pg_proc
--   WHERE proname IN ('reserve_departure', 'convert_waitlist_to_reservation');
-- =============================================================================
