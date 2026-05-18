-- ============================================================
--  customer_account_area — Anauá Ecoturismo
--  Cria tabelas para a Área do Cliente:
--    • customer_profiles       — dados pessoais do cliente
--    • emergency_contacts      — contato de emergência salvo
--    • customer_payment_methods — cards salvos (somente metadados seguros)
--
--  Segurança:
--    • RLS habilitada em todas as tabelas
--    • Usuário só lê/escreve próprias linhas (user_id = auth.uid())
--    • Staff pode ler tudo via is_staff() existente
--
--  NÃO armazena número de cartão completo nem CVV.
--
--  Execute no SQL Editor do Supabase.
-- ============================================================


-- ─── 1. customer_profiles ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.customer_profiles (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name                  text,
  document_number            text,             -- CPF (armazenado sem formatação)
  birthdate                  date,
  phone                      text,
  email                      text,
  preferred_boarding_point_id uuid        REFERENCES public.boarding_points(id) ON DELETE SET NULL,
  default_participants_count  integer     NOT NULL DEFAULT 1,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_profiles_user_unique UNIQUE (user_id)
);

-- Ao atualizar, mantém updated_at = now()
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_customer_profiles_updated_at ON public.customer_profiles;
CREATE TRIGGER trg_customer_profiles_updated_at
  BEFORE UPDATE ON public.customer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuário lê próprio perfil"      ON public.customer_profiles;
DROP POLICY IF EXISTS "Usuário insere próprio perfil"  ON public.customer_profiles;
DROP POLICY IF EXISTS "Usuário atualiza próprio perfil" ON public.customer_profiles;
DROP POLICY IF EXISTS "Staff pode ler perfis"          ON public.customer_profiles;

CREATE POLICY "Usuário lê próprio perfil"
  ON public.customer_profiles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Usuário insere próprio perfil"
  ON public.customer_profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Usuário atualiza próprio perfil"
  ON public.customer_profiles FOR UPDATE
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Usuário exclui próprio perfil"
  ON public.customer_profiles FOR DELETE
  USING (user_id = auth.uid());

-- Staff pode ler todos os perfis (depende de is_staff() existir)
CREATE POLICY "Staff pode ler perfis"
  ON public.customer_profiles FOR SELECT
  USING (public.is_staff());


-- ─── 2. emergency_contacts ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.emergency_contacts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name    text,
  phone        text,
  relationship text,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT emergency_contacts_user_unique UNIQUE (user_id)
);

DROP TRIGGER IF EXISTS trg_emergency_contacts_updated_at ON public.emergency_contacts;
CREATE TRIGGER trg_emergency_contacts_updated_at
  BEFORE UPDATE ON public.emergency_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuário lê próprio contato emergência"      ON public.emergency_contacts;
DROP POLICY IF EXISTS "Usuário insere próprio contato emergência"  ON public.emergency_contacts;
DROP POLICY IF EXISTS "Usuário atualiza próprio contato emergência" ON public.emergency_contacts;
DROP POLICY IF EXISTS "Usuário exclui próprio contato emergência"  ON public.emergency_contacts;
DROP POLICY IF EXISTS "Staff pode ler contatos emergência"         ON public.emergency_contacts;

CREATE POLICY "Usuário lê próprio contato emergência"
  ON public.emergency_contacts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Usuário insere próprio contato emergência"
  ON public.emergency_contacts FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Usuário atualiza próprio contato emergência"
  ON public.emergency_contacts FOR UPDATE
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Usuário exclui próprio contato emergência"
  ON public.emergency_contacts FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "Staff pode ler contatos emergência"
  ON public.emergency_contacts FOR SELECT
  USING (public.is_staff());


-- ─── 3. customer_payment_methods ─────────────────────────────────────────────
--  NÃO armazenar número de cartão completo nem CVV.
--  Armazenar somente metadados seguros e token do gateway.

CREATE TABLE IF NOT EXISTS public.customer_payment_methods (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider       text        NOT NULL DEFAULT 'manual',   -- 'manual', 'stripe', 'pagarme', etc.
  provider_token text,                                    -- token opaco do gateway (nunca o PAN)
  brand          text,                                    -- 'Visa', 'Mastercard', etc.
  last4          char(4),                                 -- últimos 4 dígitos
  exp_month      integer     CHECK (exp_month BETWEEN 1 AND 12),
  exp_year       integer     CHECK (exp_year >= 2024),
  holder_name    text,
  is_default     boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_customer_payment_updated_at ON public.customer_payment_methods;
CREATE TRIGGER trg_customer_payment_updated_at
  BEFORE UPDATE ON public.customer_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.customer_payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuário lê próprios cartões"      ON public.customer_payment_methods;
DROP POLICY IF EXISTS "Usuário insere próprios cartões"  ON public.customer_payment_methods;
DROP POLICY IF EXISTS "Usuário atualiza próprios cartões" ON public.customer_payment_methods;
DROP POLICY IF EXISTS "Usuário exclui próprios cartões"  ON public.customer_payment_methods;
DROP POLICY IF EXISTS "Staff pode ler cartões"           ON public.customer_payment_methods;

CREATE POLICY "Usuário lê próprios cartões"
  ON public.customer_payment_methods FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Usuário insere próprios cartões"
  ON public.customer_payment_methods FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Usuário atualiza próprios cartões"
  ON public.customer_payment_methods FOR UPDATE
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Usuário exclui próprios cartões"
  ON public.customer_payment_methods FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "Staff pode ler cartões"
  ON public.customer_payment_methods FOR SELECT
  USING (public.is_staff());


-- ─── 4. Índices ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_customer_profiles_user_id
  ON public.customer_profiles (user_id);

CREATE INDEX IF NOT EXISTS idx_emergency_contacts_user_id
  ON public.emergency_contacts (user_id);

CREATE INDEX IF NOT EXISTS idx_customer_payment_methods_user_id
  ON public.customer_payment_methods (user_id);

-- ─── 5. Grants mínimos ────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_profiles        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emergency_contacts        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_payment_methods  TO authenticated;
