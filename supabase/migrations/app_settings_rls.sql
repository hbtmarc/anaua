-- ─────────────────────────────────────────────────────────────────────────────
-- RLS policies para a tabela app_settings
-- Execute este script no Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Garante que RLS está ativo
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- 2. Leitura: admins e operadores podem ler as configurações
CREATE POLICY "Admins e operadores podem ler app_settings"
  ON public.app_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'operator')
    )
  );

-- 3. Escrita (INSERT + UPDATE + DELETE): somente admins
CREATE POLICY "Admins podem escrever em app_settings"
  ON public.app_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );
