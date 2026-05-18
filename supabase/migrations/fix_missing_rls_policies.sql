-- ============================================================
--  fix_missing_rls_policies — Anauá
--  Aplica policies que faltam para:
--    1. Staff conseguir ler/atualizar reservas no backoffice
--    2. Code do wizard conseguir decrementar departures.capacity
--       após uma reserva bem-sucedida
--    3. Wizard conseguir ler app_settings (image_consent_required)
--
--  Pré-requisito: execute fix_rls_is_staff.sql PRIMEIRO se ainda
--  não o fez (garante que public.is_staff() existe e é correto).
--
--  Execute no SQL Editor do Supabase (https://supabase.com/dashboard)
-- ============================================================


-- ── 1. is_staff() — recriar com row_security = OFF (idempotente) ─────────────
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
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'operator')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO anon;
GRANT SELECT  ON public.profiles TO authenticated;


-- ── 2. reservations — policies de staff (idempotente) ────────────────────────
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff pode ler reservas"       ON public.reservations;
DROP POLICY IF EXISTS "Staff pode atualizar reservas" ON public.reservations;
DROP POLICY IF EXISTS "Staff pode inserir reservas"   ON public.reservations;
DROP POLICY IF EXISTS "Staff pode excluir reservas"   ON public.reservations;

CREATE POLICY "Staff pode ler reservas"
  ON public.reservations FOR SELECT
  USING (public.is_staff());

CREATE POLICY "Staff pode inserir reservas"
  ON public.reservations FOR INSERT
  WITH CHECK (public.is_staff());

CREATE POLICY "Staff pode atualizar reservas"
  ON public.reservations FOR UPDATE
  USING  (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY "Staff pode excluir reservas"
  ON public.reservations FOR DELETE
  USING (public.is_staff());


-- ── 3. departures — permitir UPDATE autenticado (para decrementar capacity) ───
--  A policy atual provavelmente só permite SELECT para todos.
--  Adicionamos UPDATE para usuários autenticados (o decremento é feito
--  server-side pela código do wizard após insert bem-sucedido).
ALTER TABLE public.departures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticado pode atualizar saída" ON public.departures;

CREATE POLICY "Autenticado pode atualizar saída"
  ON public.departures FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Garante que staff também pode tudo em departures
DROP POLICY IF EXISTS "Staff pode gerenciar saídas" ON public.departures;

CREATE POLICY "Staff pode gerenciar saídas"
  ON public.departures FOR ALL
  USING (public.is_staff())
  WITH CHECK (public.is_staff());


-- ── 4. app_settings — leitura pública (sem dados sensíveis) ──────────────────
--  O wizard precisa ler image_consent_required sem autenticação.
--  Se a tabela ainda não existir, crie-a primeiro.

CREATE TABLE IF NOT EXISTS public.app_settings (
  id                         integer PRIMARY KEY DEFAULT 1,
  auto_confirm_after_payment boolean NOT NULL DEFAULT true,
  require_signal_payment     boolean NOT NULL DEFAULT false,
  allow_signal_balance       boolean NOT NULL DEFAULT true,
  image_consent_required     boolean NOT NULL DEFAULT false,
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Insere linha padrão se não existir
INSERT INTO public.app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- RLS: leitura pública; escrita apenas staff
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura pública de configurações" ON public.app_settings;
DROP POLICY IF EXISTS "Staff pode salvar configurações"  ON public.app_settings;

CREATE POLICY "Leitura pública de configurações"
  ON public.app_settings FOR SELECT
  USING (true);

CREATE POLICY "Staff pode salvar configurações"
  ON public.app_settings FOR ALL
  USING  (public.is_staff())
  WITH CHECK (public.is_staff());

GRANT SELECT ON public.app_settings TO anon, authenticated;


-- ── 5. participants e payments — policies de staff ────────────────────────────
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff pode ler participantes"     ON public.participants;
DROP POLICY IF EXISTS "Staff pode atualizar participantes" ON public.participants;

CREATE POLICY "Staff pode ler participantes"
  ON public.participants FOR SELECT
  USING (public.is_staff());

CREATE POLICY "Staff pode atualizar participantes"
  ON public.participants FOR UPDATE
  USING  (public.is_staff())
  WITH CHECK (public.is_staff());

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff pode ler pagamentos"     ON public.payments;
DROP POLICY IF EXISTS "Staff pode atualizar pagamentos" ON public.payments;

CREATE POLICY "Staff pode ler pagamentos"
  ON public.payments FOR SELECT
  USING (public.is_staff());

CREATE POLICY "Staff pode atualizar pagamentos"
  ON public.payments FOR UPDATE
  USING  (public.is_staff())
  WITH CHECK (public.is_staff());
