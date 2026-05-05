-- ============================================================
--  departure_boarding_points — Anauá
--  Pontos de embarque vinculados a uma saída.
--  Execute no SQL Editor do Supabase.
-- ============================================================

-- ── 1. Tabela principal ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.departure_boarding_points (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  departure_id uuid          NOT NULL REFERENCES public.departures(id) ON DELETE CASCADE,
  label        text          NOT NULL,
  address      text,
  pickup_at    timestamptz   NOT NULL,
  order_index  integer       NOT NULL DEFAULT 0,
  is_active    boolean       NOT NULL DEFAULT true,
  notes        text,
  created_at   timestamptz   NOT NULL DEFAULT now(),
  updated_at   timestamptz   NOT NULL DEFAULT now()
);

-- ── 2. Índices ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS departure_boarding_points_departure_id_idx
  ON public.departure_boarding_points (departure_id);

CREATE INDEX IF NOT EXISTS departure_boarding_points_pickup_at_idx
  ON public.departure_boarding_points (pickup_at);

CREATE INDEX IF NOT EXISTS departure_boarding_points_is_active_idx
  ON public.departure_boarding_points (is_active);

-- ── 3. updated_at trigger ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS departure_boarding_points_updated_at
  ON public.departure_boarding_points;

CREATE TRIGGER departure_boarding_points_updated_at
  BEFORE UPDATE ON public.departure_boarding_points
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 4. RLS ───────────────────────────────────────────────────
ALTER TABLE public.departure_boarding_points ENABLE ROW LEVEL SECURITY;

-- Público: lê apenas pontos ativos de saídas com status scheduled/sold_out
CREATE POLICY "public_select_active_boarding_points"
  ON public.departure_boarding_points
  FOR SELECT
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.departures d
      WHERE d.id = departure_id
        AND d.status IN ('scheduled', 'sold_out')
    )
  );

-- Admin: CRUD total (usa is_staff() já definida)
CREATE POLICY "admin_all_boarding_points"
  ON public.departure_boarding_points
  FOR ALL
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- ── 5. reservations.boarding_point_id (se ainda não existir) ─
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'reservations'
      AND column_name  = 'boarding_point_id'
  ) THEN
    ALTER TABLE public.reservations
      ADD COLUMN boarding_point_id uuid
        REFERENCES public.departure_boarding_points(id)
        ON DELETE SET NULL;
  END IF;
END;
$$;

-- ── 6. Permissões ────────────────────────────────────────────
GRANT SELECT ON public.departure_boarding_points TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.departure_boarding_points TO authenticated;
