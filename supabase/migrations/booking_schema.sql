-- ============================================================
--  Booking Schema — Anauá
--  Execute no SQL Editor do Supabase ANTES de testar o fluxo.
--  Idempotente (ADD COLUMN IF NOT EXISTS / DROP POLICY IF EXISTS).
-- ============================================================

-- ────────────────────────────────────────────────────────────
--  TABELA: reservations — colunas necessárias para o wizard
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS user_id         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS departure_id    uuid        REFERENCES public.departures(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_name   text,
  ADD COLUMN IF NOT EXISTS customer_email  text,
  ADD COLUMN IF NOT EXISTS customer_phone  text,
  ADD COLUMN IF NOT EXISTS payment_method  text,
  ADD COLUMN IF NOT EXISTS notes           text;

-- Índice para buscas por usuário (área do cliente)
CREATE INDEX IF NOT EXISTS reservations_user_id_idx ON public.reservations(user_id);

-- ────────────────────────────────────────────────────────────
--  TABELA: participants — colunas confirmadas
--  name, profile_type, birthdate, reservation_id já existem.
--  Não adicionamos doc_number para manter schema enxuto.
-- ────────────────────────────────────────────────────────────
-- (nada a migrar — schema já está correto)

-- ────────────────────────────────────────────────────────────
--  RLS: reservations — usuários acessam as próprias reservas
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

-- Usuário pode INSERT as próprias reservas (user_id = auth.uid())
DROP POLICY IF EXISTS "Usuário pode criar reserva" ON public.reservations;
CREATE POLICY "Usuário pode criar reserva"
  ON public.reservations
  FOR INSERT
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Usuário pode ler as próprias reservas
DROP POLICY IF EXISTS "Usuário pode ver próprias reservas" ON public.reservations;
CREATE POLICY "Usuário pode ver próprias reservas"
  ON public.reservations
  FOR SELECT
  USING (user_id = auth.uid());

-- Staff continua com acesso total (política já criada em rls_admin_policies.sql)
-- Se precisar recriar:
-- DROP POLICY IF EXISTS "Staff pode ler reservas" ON public.reservations;
-- CREATE POLICY "Staff pode ler reservas" ON public.reservations FOR SELECT USING (public.is_staff());

-- ────────────────────────────────────────────────────────────
--  RLS: participants — usuários acessam os próprios participantes
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;

-- Usuário pode INSERT participantes em suas próprias reservas
DROP POLICY IF EXISTS "Usuário pode inserir participantes" ON public.participants;
CREATE POLICY "Usuário pode inserir participantes"
  ON public.participants
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = reservation_id
        AND (r.user_id = auth.uid() OR r.user_id IS NULL)
    )
  );

-- Usuário pode ler os próprios participantes
DROP POLICY IF EXISTS "Usuário pode ver próprios participantes" ON public.participants;
CREATE POLICY "Usuário pode ver próprios participantes"
  ON public.participants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = reservation_id
        AND r.user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
--  RLS: payments — usuários acessam os próprios pagamentos
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuário pode inserir pagamentos próprios" ON public.payments;
CREATE POLICY "Usuário pode inserir pagamentos próprios"
  ON public.payments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = reservation_id
        AND (r.user_id = auth.uid() OR r.user_id IS NULL)
    )
  );

DROP POLICY IF EXISTS "Usuário pode ver próprios pagamentos" ON public.payments;
CREATE POLICY "Usuário pode ver próprios pagamentos"
  ON public.payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = reservation_id
        AND r.user_id = auth.uid()
    )
  );
