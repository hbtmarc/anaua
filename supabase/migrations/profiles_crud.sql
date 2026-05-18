-- ============================================================
--  Profiles — campos estendidos + políticas CRUD completas
--  Execute no SQL Editor do Supabase
--  (https://supabase.com/dashboard/project/dmclvlarnoimrrfndcsx/sql)
-- ============================================================

-- ── Campos opcionais para enriquecer o perfil ────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone        text,
  ADD COLUMN IF NOT EXISTS notes        text,
  ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;

-- ── Staff pode inserir perfis (convite manual) ───────────────────────────────
DROP POLICY IF EXISTS "Staff pode inserir perfis" ON public.profiles;
CREATE POLICY "Staff pode inserir perfis"
  ON public.profiles
  FOR INSERT
  WITH CHECK (public.is_staff());

-- ── Staff pode excluir perfis (caso necessário) ──────────────────────────────
DROP POLICY IF EXISTS "Staff pode excluir perfis" ON public.profiles;
CREATE POLICY "Staff pode excluir perfis"
  ON public.profiles
  FOR DELETE
  USING (public.is_staff());
