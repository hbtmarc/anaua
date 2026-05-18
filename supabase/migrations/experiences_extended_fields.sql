-- ─────────────────────────────────────────────────────────────────────────────
-- Campos estendidos para public.experiences — Anauá Ecoturismo
-- Execute no Supabase Dashboard → SQL Editor antes de usar os campos abaixo.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.experiences
  ADD COLUMN IF NOT EXISTS subtitle          TEXT,
  ADD COLUMN IF NOT EXISTS description       TEXT,
  ADD COLUMN IF NOT EXISTS duration_hours    NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS max_participants  INTEGER,
  ADD COLUMN IF NOT EXISTS is_new            BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured          BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS region            TEXT,
  ADD COLUMN IF NOT EXISTS highlights        JSONB   DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS includes          JSONB   DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS excludes          JSONB   DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS what_to_bring     JSONB   DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS gallery           JSONB   DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS currency          TEXT    DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS min_age           INTEGER,
  ADD COLUMN IF NOT EXISTS distance_km       NUMERIC(6,1),
  ADD COLUMN IF NOT EXISTS elevation_gain_m  INTEGER,
  ADD COLUMN IF NOT EXISTS cancellation_policy TEXT;
