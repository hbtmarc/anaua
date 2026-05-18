-- ============================================================
-- Migration: 20260509_experiences_extended
-- Created:   2026-05-08
-- Purpose:   Adiciona colunas estendidas à tabela experiences
--            necessárias para o backoffice renderizar dados
--            completos na página pública.
-- Notas:     short_description já existe na tabela base;
--            IF NOT EXISTS garante idempotência segura.
-- Run via:   Supabase Dashboard → SQL Editor → Executar tudo
-- ============================================================

-- Text fields
ALTER TABLE public.experiences
  ADD COLUMN IF NOT EXISTS subtitle            TEXT,
  ADD COLUMN IF NOT EXISTS short_description   TEXT,
  ADD COLUMN IF NOT EXISTS description         TEXT,
  ADD COLUMN IF NOT EXISTS duration_text       TEXT,
  ADD COLUMN IF NOT EXISTS region              TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_policy TEXT,
  ADD COLUMN IF NOT EXISTS currency            TEXT DEFAULT 'BRL';

-- Numeric fields
ALTER TABLE public.experiences
  ADD COLUMN IF NOT EXISTS duration_hours    NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS max_participants  INTEGER,
  ADD COLUMN IF NOT EXISTS min_age           INTEGER,
  ADD COLUMN IF NOT EXISTS distance_km       NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS elevation_gain_m  INTEGER;

-- Boolean flags
ALTER TABLE public.experiences
  ADD COLUMN IF NOT EXISTS is_new   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;

-- JSONB array columns (safest type across Supabase)
ALTER TABLE public.experiences
  ADD COLUMN IF NOT EXISTS highlights   JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS includes     JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS excludes     JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS what_to_bring JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS gallery      JSONB DEFAULT '[]'::JSONB;

-- Indexes on frequently-filtered boolean columns
CREATE INDEX IF NOT EXISTS idx_experiences_featured ON public.experiences (featured) WHERE featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_experiences_is_new   ON public.experiences (is_new)   WHERE is_new   = TRUE;

-- Verify
DO $$
BEGIN
  RAISE NOTICE 'Migration 20260509_experiences_extended aplicada com sucesso.';
END $$;
