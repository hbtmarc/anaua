-- =============================================================================
-- Migration: fix_schema_and_rls
-- Fixes missing columns, wrong column names, and admin RLS gaps.
-- Run in Supabase SQL Editor (once).
-- =============================================================================

-- ─── 1. participants: ensure full_name, birthdate, document_number columns ─────
-- The JS was inserting into 'name' but Supabase schema uses 'full_name'.
-- We add full_name if missing; also keep 'name' as alias if code still uses it.
ALTER TABLE participants ADD COLUMN IF NOT EXISTS full_name       text;
-- birthdate was in the JS but column did not exist in DB — add it safely
ALTER TABLE participants ADD COLUMN IF NOT EXISTS birthdate       date;
-- document_number stores CPF (digits only) — nullable to preserve old records
ALTER TABLE participants ADD COLUMN IF NOT EXISTS document_number text;

-- If 'name' column exists, migrate data then drop it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='participants' AND column_name='name'
  ) THEN
    UPDATE participants SET full_name = name WHERE full_name IS NULL AND name IS NOT NULL;
  END IF;
END $$;

-- ─── 2. payments: ensure method column (payment_method alias) ─────────────────
ALTER TABLE payments ADD COLUMN IF NOT EXISTS method text;

-- Widen payments_method_check to include all app-used values
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_method_check
  CHECK (method IN ('pix','credit_card','signal_balance','boleto','bank_transfer','cash'));

-- If payment_method exists, migrate data
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='payments' AND column_name='payment_method'
  ) THEN
    UPDATE payments SET method = payment_method WHERE method IS NULL AND payment_method IS NOT NULL;
  END IF;
END $$;

-- ─── 3. reservations: ensure experience_id and departure_id exist ─────────────
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS experience_id    uuid REFERENCES experiences(id);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS departure_id     uuid REFERENCES departures(id);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS boarding_point_id uuid REFERENCES departure_boarding_points(id);

-- Track whether capacity has been restored for a cancelled reservation.
-- Prevents double-restore when cancel + delete are both applied.
-- Default FALSE means "not yet restored" (safe for existing cancelled rows).
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS capacity_restored boolean NOT NULL DEFAULT false;

-- Widen reservation_status check constraint to include all app-used values
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_reservation_status_check;
ALTER TABLE reservations ADD CONSTRAINT reservations_reservation_status_check
  CHECK (reservation_status IN ('pending','pending_payment','reserved','confirmed','cancelled','refunded'));

-- ─── 3b. Trigger: auto-restore departure capacity on cancel (SECURITY DEFINER) ──
-- Runs as the function owner (superuser), bypassing RLS on departures.
-- Fires BEFORE UPDATE so we can set NEW.capacity_restored = true in one round-trip.
CREATE OR REPLACE FUNCTION fn_restore_departure_capacity()
RETURNS TRIGGER AS $$
BEGIN
  -- Only act when status changes TO 'cancelled' and not already restored
  IF NEW.reservation_status = 'cancelled'
     AND OLD.reservation_status <> 'cancelled'
     AND NOT OLD.capacity_restored
     AND OLD.departure_id IS NOT NULL THEN

    UPDATE departures
    SET capacity = capacity + (
      SELECT COUNT(*) FROM participants WHERE reservation_id = OLD.id
    )
    WHERE id = OLD.departure_id;

    -- Mark restored so a subsequent delete does not double-count
    NEW.capacity_restored = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_restore_capacity ON reservations;
CREATE TRIGGER trg_restore_capacity
  BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION fn_restore_departure_capacity();

-- ─── 4. app_settings: ensure table with key/value schema ─────────────────────
-- Uses key text PRIMARY KEY (admin.js upserts by key='company_settings')
-- Also has image_consent_required boolean (reserva.js reads the 'image_consent' row)
CREATE TABLE IF NOT EXISTS app_settings (
  key                     text PRIMARY KEY,
  value                   jsonb,
  image_consent_required  boolean NOT NULL DEFAULT false,
  updated_by              uuid,
  updated_at              timestamptz DEFAULT now()
);

-- Add columns to existing table if they were missing
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS value                  jsonb;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS image_consent_required boolean NOT NULL DEFAULT false;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS updated_by             uuid;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS updated_at             timestamptz DEFAULT now();

-- Seed default rows
INSERT INTO app_settings (key, image_consent_required, value)
VALUES ('image_consent', false, '{}'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_settings (key, value)
VALUES ('company_settings', '{}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ─── 5. RLS — reservations ────────────────────────────────────────────────────
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reservations_self"     ON reservations;
DROP POLICY IF EXISTS "reservations_admin"    ON reservations;
DROP POLICY IF EXISTS "reservations_all"      ON reservations;
DROP POLICY IF EXISTS "allow_self_reservations" ON reservations;

-- Users see/insert/update their own rows
CREATE POLICY "reservations_self" ON reservations
  FOR ALL
  USING (auth.uid() = user_id OR user_id IS NULL)
  WITH CHECK (true);

-- Admin / operator: full access to all reservations
CREATE POLICY "reservations_admin" ON reservations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','operator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','operator')
    )
  );

-- ─── 6. RLS — participants ────────────────────────────────────────────────────
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "participants_self"   ON participants;
DROP POLICY IF EXISTS "participants_admin"  ON participants;
DROP POLICY IF EXISTS "allow_participants"  ON participants;

CREATE POLICY "participants_self" ON participants
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM reservations r
      WHERE r.id = participants.reservation_id
        AND (r.user_id = auth.uid() OR r.user_id IS NULL)
    )
  )
  WITH CHECK (true);

-- Admin / operator: full access to all participants
CREATE POLICY "participants_admin" ON participants
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','operator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','operator')
    )
  );

-- ─── 7. RLS — payments ───────────────────────────────────────────────────────
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_self"   ON payments;
DROP POLICY IF EXISTS "payments_admin"  ON payments;
DROP POLICY IF EXISTS "allow_payments"  ON payments;

CREATE POLICY "payments_self" ON payments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM reservations r
      WHERE r.id = payments.reservation_id
        AND (r.user_id = auth.uid() OR r.user_id IS NULL)
    )
  )
  WITH CHECK (true);

CREATE POLICY "payments_admin" ON payments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','operator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','operator')
    )
  );

-- ─── 8. app_settings: public read ────────────────────────────────────────────
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_settings_read" ON app_settings;
CREATE POLICY "app_settings_read" ON app_settings
  FOR SELECT USING (true);

-- ─── 9. departures: admin write (restore capacity on cancel) ─────────────────
ALTER TABLE departures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "departures_public_read" ON departures;
DROP POLICY IF EXISTS "departures_admin"        ON departures;

-- Everyone can read departures (public experience listing needs this)
CREATE POLICY "departures_public_read" ON departures
  FOR SELECT USING (true);

-- Admin / operator: full write access (update capacity, create, delete)
CREATE POLICY "departures_admin" ON departures
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','operator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','operator')
    )
  );

-- ─── 10. experiences: extended content fields ───────────────────────────────
-- These are the full set of fields used by the public pages and admin forms.
-- JSONB columns store arrays (highlights, includes, excludes, what_to_bring, gallery).
-- All additions are safe/idempotent via ADD COLUMN IF NOT EXISTS.
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS short_description    text;
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS duration_text        text;
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS highlights           jsonb;
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS includes             jsonb;
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS excludes             jsonb;
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS what_to_bring        jsonb;
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS gallery              jsonb;
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS cancellation_policy  text;
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS region               text;
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS currency             text NOT NULL DEFAULT 'BRL';
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS min_age              int;
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS distance_km          numeric(6,1);
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS elevation_gain_m     int;
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS is_new               boolean NOT NULL DEFAULT false;
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS featured             boolean NOT NULL DEFAULT false;
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS subtitle             text;
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS description          text;
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS duration_hours       numeric(4,1);
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS max_participants     int;

-- RLS: experiences are readable by all (public listing); admin can write
ALTER TABLE experiences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "experiences_public_read" ON experiences;
DROP POLICY IF EXISTS "experiences_admin"        ON experiences;

CREATE POLICY "experiences_public_read" ON experiences
  FOR SELECT USING (true);

CREATE POLICY "experiences_admin" ON experiences
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','operator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','operator')
    )
  );

-- ─── 11. departures: fix status constraint to allow sold_out/completed ───────
-- The UI uses 'sold_out' and 'completed' but the original schema may only allow
-- 'scheduled' and 'cancelled'. This widens it idempotently.
ALTER TABLE departures DROP CONSTRAINT IF EXISTS departures_status_check;
ALTER TABLE departures ADD CONSTRAINT departures_status_check
  CHECK (status IN ('scheduled', 'sold_out', 'cancelled', 'completed'));

-- Ensure the column exists with a safe default
ALTER TABLE departures ALTER COLUMN status SET DEFAULT 'scheduled';

-- ─── 12. RPC: reserve_departure — atomic reservation with capacity lock ───────
-- Locks the departure row, validates capacity, creates reservation + participants
-- and updates status to 'sold_out' when capacity reaches zero.
-- Runs as SECURITY DEFINER so it bypasses RLS on departures.
CREATE OR REPLACE FUNCTION reserve_departure(
  p_departure_id     uuid,
  p_experience_id    uuid,
  p_user_id          uuid,
  p_customer_name    text,
  p_customer_email   text,
  p_customer_phone   text,
  p_payment_method   text,
  p_total_amount     numeric,
  p_amount_paid      numeric,
  p_notes            text,
  p_participants     jsonb   -- array of {full_name, profile_type, birthdate}
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_departure        departures%ROWTYPE;
  v_occupied_seats   int;
  v_pax_count        int;
  v_new_capacity     int;
  v_reservation_id   uuid;
  v_participant      jsonb;
BEGIN
  -- Lock the departure row to prevent race conditions
  SELECT * INTO v_departure
  FROM departures
  WHERE id = p_departure_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Saída não encontrada.');
  END IF;

  IF v_departure.status IN ('cancelled', 'completed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Saída não está mais disponível.');
  END IF;

  IF v_departure.status = 'sold_out' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Saída esgotada.');
  END IF;

  -- Count occupied seats from non-cancelled reservations
  SELECT COALESCE(SUM(p_count.cnt), 0) INTO v_occupied_seats
  FROM (
    SELECT COUNT(*) AS cnt
    FROM participants pt
    JOIN reservations r ON r.id = pt.reservation_id
    WHERE r.departure_id = p_departure_id
      AND r.reservation_status NOT IN ('cancelled', 'refunded')
  ) p_count;

  v_pax_count := jsonb_array_length(p_participants);

  IF v_pax_count = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Informe pelo menos um participante.');
  END IF;

  -- Check capacity
  IF (v_departure.capacity - v_occupied_seats) < v_pax_count THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', format(
        'Vagas insuficientes. Disponível: %s. Solicitado: %s.',
        GREATEST(v_departure.capacity - v_occupied_seats, 0),
        v_pax_count
      )
    );
  END IF;

  -- Create reservation
  INSERT INTO reservations (
    departure_id, experience_id, user_id,
    customer_name, customer_email, customer_phone,
    payment_method, reservation_status,
    total_amount, amount_paid, notes
  ) VALUES (
    p_departure_id, p_experience_id, p_user_id,
    p_customer_name, p_customer_email, p_customer_phone,
    p_payment_method, 'reserved',
    p_total_amount, p_amount_paid, p_notes
  )
  RETURNING id INTO v_reservation_id;

  -- Insert participants
  FOR v_participant IN SELECT * FROM jsonb_array_elements(p_participants) LOOP
    INSERT INTO participants (reservation_id, full_name, profile_type, birthdate, document_number)
    VALUES (
      v_reservation_id,
      NULLIF(v_participant->>'full_name', ''),
      COALESCE(NULLIF(v_participant->>'profile_type', ''), 'adult'),
      CASE WHEN (v_participant->>'birthdate') = '' OR (v_participant->>'birthdate') IS NULL
           THEN NULL
           ELSE (v_participant->>'birthdate')::date END,
      NULLIF(v_participant->>'document_number', '')
    );
  END LOOP;

  -- Decrement capacity and auto-mark sold_out when full
  v_new_capacity := v_departure.capacity - v_pax_count;
  UPDATE departures
  SET
    capacity = GREATEST(v_new_capacity, 0),
    status   = CASE WHEN v_new_capacity <= 0 THEN 'sold_out' ELSE status END
  WHERE id = p_departure_id;

  RETURN jsonb_build_object(
    'ok',             true,
    'reservation_id', v_reservation_id,
    'new_capacity',   GREATEST(v_new_capacity, 0),
    'sold_out',       v_new_capacity <= 0
  );
END;
$$;

-- Grant execute to authenticated users (RLS on related tables still applies for reads)
GRANT EXECUTE ON FUNCTION reserve_departure TO authenticated;

-- ─── 13. Reload PostgREST schema cache ───────────────────────────────────────
NOTIFY pgrst, 'reload schema';
