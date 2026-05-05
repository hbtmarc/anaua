-- ============================================================
--  reusable_boarding_points — Anauá
--  Substitui o schema ad-hoc de pontos de embarque por um
--  catálogo reutilizável.
--  Execute no SQL Editor do Supabase (após set_updated_at()
--  já ter sido criada por migration anterior).
-- ============================================================

-- ── 1. Catálogo de pontos de embarque reutilizáveis ──────────
CREATE TABLE IF NOT EXISTS public.boarding_points (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  address    text,
  reference  text,
  city       text,
  state      text,
  is_active  boolean     NOT NULL DEFAULT true,
  sort_order integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS boarding_points_is_active_idx
  ON public.boarding_points (is_active);
CREATE INDEX IF NOT EXISTS boarding_points_sort_order_idx
  ON public.boarding_points (sort_order);

DROP TRIGGER IF EXISTS boarding_points_updated_at ON public.boarding_points;
CREATE TRIGGER boarding_points_updated_at
  BEFORE UPDATE ON public.boarding_points
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 2. Recria departure_boarding_points com FK ao catálogo ───
--  Se a tabela existir com o schema antigo (coluna 'label' mas
--  sem 'boarding_point_id'), remove e recria. Caso contrário
--  usa CREATE TABLE IF NOT EXISTS (idempotente).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'departure_boarding_points'
      AND column_name  = 'label'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'departure_boarding_points'
      AND column_name  = 'boarding_point_id'
  ) THEN
    -- Remove reservations FK antes de dropar
    ALTER TABLE IF EXISTS public.reservations
      DROP COLUMN IF EXISTS boarding_point_id;
    DROP TABLE public.departure_boarding_points CASCADE;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.departure_boarding_points (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  departure_id      uuid        NOT NULL REFERENCES public.departures(id) ON DELETE CASCADE,
  -- NULL = ponto personalizado (apenas para esta saída)
  boarding_point_id uuid        REFERENCES public.boarding_points(id) ON DELETE SET NULL,
  pickup_at         timestamptz NOT NULL,
  -- Overrides e campos do ponto personalizado
  custom_label      text,
  custom_address    text,
  notes             text,
  is_active         boolean     NOT NULL DEFAULT true,
  sort_order        integer     NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- Ou tem FK ao catálogo OU tem rótulo personalizado
  CONSTRAINT dbp_has_label CHECK (
    boarding_point_id IS NOT NULL OR custom_label IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS dep_bp_departure_id_idx
  ON public.departure_boarding_points (departure_id);
CREATE INDEX IF NOT EXISTS dep_bp_boarding_point_id_idx
  ON public.departure_boarding_points (boarding_point_id);
CREATE INDEX IF NOT EXISTS dep_bp_is_active_idx
  ON public.departure_boarding_points (is_active);

DROP TRIGGER IF EXISTS departure_boarding_points_updated_at
  ON public.departure_boarding_points;
CREATE TRIGGER departure_boarding_points_updated_at
  BEFORE UPDATE ON public.departure_boarding_points
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 3. RLS — boarding_points (catálogo) ─────────────────────
ALTER TABLE public.boarding_points ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_boarding_points_catalog" ON public.boarding_points;
CREATE POLICY "public_select_boarding_points_catalog"
  ON public.boarding_points FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "admin_all_boarding_points_catalog" ON public.boarding_points;
CREATE POLICY "admin_all_boarding_points_catalog"
  ON public.boarding_points FOR ALL
  USING  (public.is_staff())
  WITH CHECK (public.is_staff());

-- ── 4. RLS — departure_boarding_points (junção) ─────────────
ALTER TABLE public.departure_boarding_points ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_active_boarding_points" ON public.departure_boarding_points;
CREATE POLICY "public_select_active_boarding_points"
  ON public.departure_boarding_points FOR SELECT
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.departures d
      WHERE d.id = departure_id
        AND d.status IN ('scheduled', 'sold_out')
    )
  );

DROP POLICY IF EXISTS "admin_all_boarding_points" ON public.departure_boarding_points;
CREATE POLICY "admin_all_boarding_points"
  ON public.departure_boarding_points FOR ALL
  USING  (public.is_staff())
  WITH CHECK (public.is_staff());

-- ── 5. reservations.boarding_point_id ───────────────────────
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
GRANT SELECT ON public.boarding_points TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.boarding_points TO authenticated;

GRANT SELECT ON public.departure_boarding_points TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.departure_boarding_points TO authenticated;
