-- ============================================================
--  RLS — reservations: permitir que o próprio cliente leia
--  suas reservas (user_id = auth.uid())
--  Execute no SQL Editor do Supabase
-- ============================================================

-- Cliente lê suas próprias reservas
DROP POLICY IF EXISTS "Cliente pode ler suas reservas" ON public.reservations;
CREATE POLICY "Cliente pode ler suas reservas"
  ON public.reservations
  FOR SELECT
  USING (user_id = auth.uid());

-- Cliente lê participantes das suas reservas
DROP POLICY IF EXISTS "Cliente pode ler seus participantes" ON public.participants;
CREATE POLICY "Cliente pode ler seus participantes"
  ON public.participants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.reservations r
      WHERE r.id = reservation_id
        AND r.user_id = auth.uid()
    )
  );
