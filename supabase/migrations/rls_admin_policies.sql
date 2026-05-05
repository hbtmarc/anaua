-- ============================================================
--  RLS Policies — Anauá Admin
--  Execute este arquivo no SQL Editor do Supabase
--  (https://supabase.com/dashboard/project/dmclvlarnoimrrfndcsx/sql)
-- ============================================================

-- ── Helper: verifica se o usuário logado é admin ou operator ─────────────────
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id   = auth.uid()
      AND role IN ('admin', 'operator')
  );
$$;

-- Permite que usuários autenticados (e anon) executem a função nas políticas RLS
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO anon;

-- ============================================================
--  TABELA: reservations
-- ============================================================
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

-- Leitura total para staff
DROP POLICY IF EXISTS "Staff pode ler reservas" ON public.reservations;
CREATE POLICY "Staff pode ler reservas"
  ON public.reservations
  FOR SELECT
  USING (public.is_staff());

-- Escrita total para staff
DROP POLICY IF EXISTS "Staff pode atualizar reservas" ON public.reservations;
CREATE POLICY "Staff pode atualizar reservas"
  ON public.reservations
  FOR UPDATE
  USING (public.is_staff());

-- INSERT para staff (criação manual de reservas)
DROP POLICY IF EXISTS "Staff pode inserir reservas" ON public.reservations;
CREATE POLICY "Staff pode inserir reservas"
  ON public.reservations
  FOR INSERT
  WITH CHECK (public.is_staff());

-- ============================================================
--  TABELA: payments
-- ============================================================
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff pode ler pagamentos" ON public.payments;
CREATE POLICY "Staff pode ler pagamentos"
  ON public.payments
  FOR SELECT
  USING (public.is_staff());

DROP POLICY IF EXISTS "Staff pode inserir pagamentos" ON public.payments;
CREATE POLICY "Staff pode inserir pagamentos"
  ON public.payments
  FOR INSERT
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff pode atualizar pagamentos" ON public.payments;
CREATE POLICY "Staff pode atualizar pagamentos"
  ON public.payments
  FOR UPDATE
  USING (public.is_staff());

-- ============================================================
--  TABELA: departures
-- ============================================================
ALTER TABLE public.departures ENABLE ROW LEVEL SECURITY;

-- Leitura pública (exibição no site)
DROP POLICY IF EXISTS "Público pode ler saídas" ON public.departures;
CREATE POLICY "Público pode ler saídas"
  ON public.departures
  FOR SELECT
  USING (true);

-- Escrita restrita ao staff
DROP POLICY IF EXISTS "Staff pode gerenciar saídas" ON public.departures;
CREATE POLICY "Staff pode gerenciar saídas"
  ON public.departures
  FOR ALL
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- ============================================================
--  TABELA: participants
-- ============================================================
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff pode ler participantes" ON public.participants;
CREATE POLICY "Staff pode ler participantes"
  ON public.participants
  FOR SELECT
  USING (public.is_staff());

DROP POLICY IF EXISTS "Staff pode gerenciar participantes" ON public.participants;
CREATE POLICY "Staff pode gerenciar participantes"
  ON public.participants
  FOR ALL
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- ============================================================
--  TABELA: experiences
-- ============================================================
ALTER TABLE public.experiences ENABLE ROW LEVEL SECURITY;

-- Leitura pública de experiências ativas
DROP POLICY IF EXISTS "Público pode ler experiências ativas" ON public.experiences;
CREATE POLICY "Público pode ler experiências ativas"
  ON public.experiences
  FOR SELECT
  USING (is_active IS DISTINCT FROM false);

-- Staff vê tudo (incluindo inativas)
DROP POLICY IF EXISTS "Staff pode ler todas as experiências" ON public.experiences;
CREATE POLICY "Staff pode ler todas as experiências"
  ON public.experiences
  FOR SELECT
  USING (public.is_staff());

-- Staff gerencia
DROP POLICY IF EXISTS "Staff pode gerenciar experiências" ON public.experiences;
CREATE POLICY "Staff pode gerenciar experiências"
  ON public.experiences
  FOR ALL
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- ============================================================
--  TABELA: waitlist_entries
-- ============================================================
ALTER TABLE public.waitlist_entries ENABLE ROW LEVEL SECURITY;

-- Qualquer um pode entrar na lista
DROP POLICY IF EXISTS "Público pode inserir na lista de espera" ON public.waitlist_entries;
CREATE POLICY "Público pode inserir na lista de espera"
  ON public.waitlist_entries
  FOR INSERT
  WITH CHECK (true);

-- Staff gerencia
DROP POLICY IF EXISTS "Staff pode ler lista de espera" ON public.waitlist_entries;
CREATE POLICY "Staff pode ler lista de espera"
  ON public.waitlist_entries
  FOR SELECT
  USING (public.is_staff());

DROP POLICY IF EXISTS "Staff pode atualizar lista de espera" ON public.waitlist_entries;
CREATE POLICY "Staff pode atualizar lista de espera"
  ON public.waitlist_entries
  FOR UPDATE
  USING (public.is_staff());

-- ============================================================
--  TABELA: profiles
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Usuário lê o próprio perfil
DROP POLICY IF EXISTS "Usuário lê próprio perfil" ON public.profiles;
CREATE POLICY "Usuário lê próprio perfil"
  ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

-- Staff lê todos os perfis (para o módulo Usuários)
DROP POLICY IF EXISTS "Staff lê todos os perfis" ON public.profiles;
CREATE POLICY "Staff lê todos os perfis"
  ON public.profiles
  FOR SELECT
  USING (public.is_staff());

-- Staff atualiza perfis (troca de role, etc.)
DROP POLICY IF EXISTS "Staff atualiza perfis" ON public.profiles;
CREATE POLICY "Staff atualiza perfis"
  ON public.profiles
  FOR UPDATE
  USING (public.is_staff());
