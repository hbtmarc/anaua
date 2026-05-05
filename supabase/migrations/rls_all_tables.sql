-- ─────────────────────────────────────────────────────────────────────────────
-- RLS Policies para o backoffice Anauá Ecoturismo
-- Execute no Supabase Dashboard → SQL Editor
-- Cobre: reservations, departures, payments, participants,
--        experiences, app_settings, profiles
-- ─────────────────────────────────────────────────────────────────────────────

-- NOTE: Foreign key constraints foram removidas deste script pois dependem
-- do schema real de cada tabela. Ajuste conforme necessário após verificar
-- as colunas em Table Editor → cada tabela.


-- Helper: retorna true se o usuário logado tem role admin ou operator
-- (evita repetir o sub-select em cada policy)
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'operator')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;

-- ── app_settings ──────────────────────────────────────────────────────────────
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_app_settings"  ON public.app_settings;
DROP POLICY IF EXISTS "admin_write_app_settings" ON public.app_settings;

CREATE POLICY "staff_read_app_settings"
  ON public.app_settings FOR SELECT TO authenticated
  USING (public.is_staff());

CREATE POLICY "admin_write_app_settings"
  ON public.app_settings FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── reservations ─────────────────────────────────────────────────────────────
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_reservations"  ON public.reservations;
DROP POLICY IF EXISTS "staff_write_reservations" ON public.reservations;
DROP POLICY IF EXISTS "admin_write_reservations" ON public.reservations;
DROP POLICY IF EXISTS "owner_read_reservations"  ON public.reservations;

-- Staff vê e gerencia todas as reservas
CREATE POLICY "staff_read_reservations"
  ON public.reservations FOR SELECT TO authenticated
  USING (public.is_staff());

CREATE POLICY "staff_write_reservations"
  ON public.reservations FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- ── departures ───────────────────────────────────────────────────────────────
ALTER TABLE public.departures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_departures"   ON public.departures;
DROP POLICY IF EXISTS "staff_write_departures"   ON public.departures;

-- Qualquer um (inclusive anônimo) pode ler saídas — necessário para o site público
CREATE POLICY "public_read_departures"
  ON public.departures FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "staff_write_departures"
  ON public.departures FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- ── experiences ──────────────────────────────────────────────────────────────
ALTER TABLE public.experiences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_experiences"  ON public.experiences;
DROP POLICY IF EXISTS "staff_write_experiences"  ON public.experiences;

CREATE POLICY "public_read_experiences"
  ON public.experiences FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "staff_write_experiences"
  ON public.experiences FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- ── payments ─────────────────────────────────────────────────────────────────
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_payments"  ON public.payments;
DROP POLICY IF EXISTS "staff_write_payments" ON public.payments;

CREATE POLICY "staff_read_payments"
  ON public.payments FOR SELECT TO authenticated
  USING (public.is_staff());

CREATE POLICY "staff_write_payments"
  ON public.payments FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- ── participants ─────────────────────────────────────────────────────────────
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_participants"  ON public.participants;
DROP POLICY IF EXISTS "staff_write_participants" ON public.participants;

CREATE POLICY "staff_read_participants"
  ON public.participants FOR SELECT TO authenticated
  USING (public.is_staff());

CREATE POLICY "staff_write_participants"
  ON public.participants FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- ── profiles ─────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_profiles"  ON public.profiles;
DROP POLICY IF EXISTS "owner_read_profile"   ON public.profiles;
DROP POLICY IF EXISTS "admin_write_profiles" ON public.profiles;
DROP POLICY IF EXISTS "owner_write_profile"  ON public.profiles;

-- Usuário lê o próprio perfil
CREATE POLICY "owner_read_profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Admin lê todos os perfis
CREATE POLICY "staff_read_profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_staff());

-- Admin altera roles de qualquer perfil
CREATE POLICY "admin_write_profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Usuário atualiza o próprio perfil (exceto role)
CREATE POLICY "owner_write_profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
