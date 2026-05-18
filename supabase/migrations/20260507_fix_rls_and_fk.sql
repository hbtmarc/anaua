-- =============================================================================
-- Migration: Fix RLS policies + FK relationships for PostgREST schema cache
-- Run this in: Supabase Dashboard → SQL Editor
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. RESERVATIONS — fix RLS + add FK constraints for join support
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable RLS (idempotent)
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

-- Drop any existing broken policies on reservations
DROP POLICY IF EXISTS "Users can view own reservations"     ON public.reservations;
DROP POLICY IF EXISTS "Users can insert own reservations"   ON public.reservations;
DROP POLICY IF EXISTS "Users can update own reservations"   ON public.reservations;
DROP POLICY IF EXISTS "reservations_select_own"             ON public.reservations;
DROP POLICY IF EXISTS "reservations_insert_own"             ON public.reservations;
DROP POLICY IF EXISTS "reservations_update_own"             ON public.reservations;
-- Catch-all for any policy referencing auth.users directly
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'reservations' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.reservations', pol.policyname);
  END LOOP;
END$$;

-- Recreate correct policies using auth.uid() (never references auth.users table)
CREATE POLICY "reservations_select_own"
  ON public.reservations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "reservations_insert_own"
  ON public.reservations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reservations_update_own"
  ON public.reservations FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow service role full access (for backoffice / admin functions)
CREATE POLICY "reservations_service_role"
  ON public.reservations FOR ALL
  USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ADD MISSING COLUMNS + FK CONSTRAINTS
--    Adds experience_id / departure_id if they don't exist, then creates FKs.
-- ─────────────────────────────────────────────────────────────────────────────

-- Add experience_id column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reservations' AND column_name = 'experience_id'
  ) THEN
    ALTER TABLE public.reservations ADD COLUMN experience_id uuid;
  END IF;
END$$;

-- Add departure_id column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reservations' AND column_name = 'departure_id'
  ) THEN
    ALTER TABLE public.reservations ADD COLUMN departure_id uuid;
  END IF;
END$$;

-- Add boarding_point_id column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reservations' AND column_name = 'boarding_point_id'
  ) THEN
    ALTER TABLE public.reservations ADD COLUMN boarding_point_id uuid;
  END IF;
END$$;

-- FK: reservations.experience_id → experiences.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'reservations_experience_id_fkey'
      AND table_schema = 'public' AND table_name = 'reservations'
  ) THEN
    ALTER TABLE public.reservations
      ADD CONSTRAINT reservations_experience_id_fkey
      FOREIGN KEY (experience_id) REFERENCES public.experiences(id)
      ON DELETE SET NULL;
  END IF;
END$$;

-- FK: reservations.departure_id → departures.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'reservations_departure_id_fkey'
      AND table_schema = 'public' AND table_name = 'reservations'
  ) THEN
    ALTER TABLE public.reservations
      ADD CONSTRAINT reservations_departure_id_fkey
      FOREIGN KEY (departure_id) REFERENCES public.departures(id)
      ON DELETE SET NULL;
  END IF;
END$$;

-- Grant SELECT on experiences and departures to authenticated role
-- (PostgREST needs read access to resolve joins)
GRANT SELECT ON public.experiences TO authenticated;
GRANT SELECT ON public.departures  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CUSTOMER_PROFILES — create table if missing + correct RLS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.customer_profiles (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name                   text,
  document_number             text,
  birthdate                   date,
  phone                       text,
  email                       text,
  preferred_boarding_point_id uuid,
  default_participants_count  int         NOT NULL DEFAULT 1,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- Force RLS on (covers tables that existed before RLS was enabled)
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_profiles FORCE ROW LEVEL SECURITY;

-- Revoke all first, then grant explicitly (prevents stale privilege state)
REVOKE ALL ON public.customer_profiles FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_profiles TO authenticated;

-- Drop every existing policy by name (explicit list avoids loop race conditions)
DROP POLICY IF EXISTS "customer_profiles_select_own" ON public.customer_profiles;
DROP POLICY IF EXISTS "customer_profiles_insert_own" ON public.customer_profiles;
DROP POLICY IF EXISTS "customer_profiles_update_own" ON public.customer_profiles;
DROP POLICY IF EXISTS "customer_profiles_delete_own" ON public.customer_profiles;
DROP POLICY IF EXISTS "customer_profiles_all_own"    ON public.customer_profiles;
-- catch any legacy names
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'customer_profiles' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.customer_profiles', pol.policyname);
  END LOOP;
END$$;

-- Single permissive ALL policy — simplest and most reliable for own-row tables
CREATE POLICY "customer_profiles_own"
  ON public.customer_profiles
  FOR ALL                              -- covers SELECT, INSERT, UPDATE, DELETE
  USING     (auth.uid() = user_id)    -- read/update/delete guard
  WITH CHECK(auth.uid() = user_id);   -- write guard

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. EMERGENCY_CONTACTS — create table if missing + correct RLS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.emergency_contacts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name    text,
  phone        text,
  relationship text,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_contacts FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.emergency_contacts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emergency_contacts TO authenticated;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'emergency_contacts' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.emergency_contacts', pol.policyname);
  END LOOP;
END$$;

CREATE POLICY "ec_own"
  ON public.emergency_contacts
  FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK(auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. CUSTOMER_PAYMENT_METHODS — create table if missing + correct RLS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.customer_payment_methods (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider    text,
  brand       text,
  last4       char(4),
  exp_month   smallint,
  exp_year    smallint,
  holder_name text,
  is_default  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_payment_methods FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.customer_payment_methods FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_payment_methods TO authenticated;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'customer_payment_methods' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.customer_payment_methods', pol.policyname);
  END LOOP;
END$$;

CREATE POLICY "cpm_own"
  ON public.customer_payment_methods
  FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK(auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. NOTIFY PostgREST to reload schema cache
--    (so FK-based joins become available immediately without a restart)
-- ─────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
