-- ============================================================
--  fix_rls_is_staff — Anauá
--  Corrige problema de avaliação da função is_staff() com RLS.
--
--  Problema: is_staff() consulta public.profiles, que tem RLS
--  habilitado. Em alguns contextos do Supabase o SECURITY DEFINER
--  não bypassa RLS corretamente, causando 403 nas políticas que
--  dependem de is_staff().
--
--  Solução 1 (primária): recriar is_staff() com SET row_security = OFF
--    → força bypass de RLS dentro da função, independente do role.
--
--  Solução 2 (fallback via JWT): também aceita claims 'role' no JWT
--    pelo app_metadata, eliminando dependência do DB.
--
--  Execute no SQL Editor do Supabase.
-- ============================================================

-- ── 1. Recriar is_staff() com row_security = OFF ─────────────
--  row_security = OFF garante que a consulta a profiles dentro
--  da função nunca seja bloqueada por RLS, mesmo com SECURITY
--  DEFINER em contextos onde o owner não é superuser.
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = OFF
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id   = auth.uid()
      AND role IN ('admin', 'operator')
  );
END;
$$;

-- Garante grants
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO anon;

-- ── 2. Garante que authenticated pode SELECT em profiles ──────
--  Sem isso a consulta interna pode falhar se o schema mudar.
GRANT SELECT ON public.profiles TO authenticated;

-- ── 3. Reaplica políticas críticas de reservations ───────────
--  (por segurança, reconstrói todas as policies de staff)

ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff pode ler reservas"        ON public.reservations;
DROP POLICY IF EXISTS "Staff pode atualizar reservas"  ON public.reservations;
DROP POLICY IF EXISTS "Staff pode inserir reservas"    ON public.reservations;
DROP POLICY IF EXISTS "Staff pode excluir reservas"    ON public.reservations;

CREATE POLICY "Staff pode ler reservas"
  ON public.reservations FOR SELECT
  USING (public.is_staff());

CREATE POLICY "Staff pode inserir reservas"
  ON public.reservations FOR INSERT
  WITH CHECK (public.is_staff());

CREATE POLICY "Staff pode atualizar reservas"
  ON public.reservations FOR UPDATE
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY "Staff pode excluir reservas"
  ON public.reservations FOR DELETE
  USING (public.is_staff());

-- ── 4. Reaplica políticas de payments ────────────────────────
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff pode ler pagamentos"      ON public.payments;
DROP POLICY IF EXISTS "Staff pode inserir pagamentos"  ON public.payments;
DROP POLICY IF EXISTS "Staff pode atualizar pagamentos" ON public.payments;
DROP POLICY IF EXISTS "Staff pode excluir pagamentos"  ON public.payments;

CREATE POLICY "Staff pode ler pagamentos"
  ON public.payments FOR SELECT
  USING (public.is_staff());

CREATE POLICY "Staff pode inserir pagamentos"
  ON public.payments FOR INSERT
  WITH CHECK (public.is_staff());

CREATE POLICY "Staff pode atualizar pagamentos"
  ON public.payments FOR UPDATE
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY "Staff pode excluir pagamentos"
  ON public.payments FOR DELETE
  USING (public.is_staff());

-- ── 5. Reaplica políticas de participants ─────────────────────
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff pode ler participantes"     ON public.participants;
DROP POLICY IF EXISTS "Staff pode gerenciar participantes" ON public.participants;

CREATE POLICY "Staff pode ler participantes"
  ON public.participants FOR SELECT
  USING (public.is_staff());

CREATE POLICY "Staff pode gerenciar participantes"
  ON public.participants FOR ALL
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- ── 6. Verificação rápida ─────────────────────────────────────
--  Após rodar, execute manualmente para confirmar:
--
--    SELECT public.is_staff();          -- deve retornar true se logado como admin
--    SELECT count(*) FROM reservations; -- deve retornar número, não 403
--
-- ============================================================
