-- ============================================================
--  create_experience_bundle — Anauá
--  Cria em uma transação atômica:
--    1. uma experiência
--    2. uma saída (opcional)
--    3. uma reserva manual (opcional)
--    4. participantes (opcional, vinculados à reserva)
--
--  Protegida por is_admin() — chamada via service-role ou JWT com role=admin.
--  Execute no SQL Editor do Supabase.
-- ============================================================

-- ────────────────────────────────────────────────────────────
--  Helper: verifica se o usuário chamante é staff/admin
--  (pode já existir no projeto — CREATE OR REPLACE é seguro)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  -- Considera staff quem tiver role='admin' em app_metadata (definido pelo dashboard)
  -- ou quem for service_role. Nenhuma tabela extra necessária.
  SELECT COALESCE(
    (auth.jwt()->'app_metadata'->>'role') IN ('admin','service_role'),
    false
  );
$$;

-- ────────────────────────────────────────────────────────────
--  RPC principal
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_experience_bundle(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_exp_id      uuid;
  v_dep_id      uuid := null;
  v_res_id      uuid := null;
  v_exp         jsonb := payload->'experience';
  v_dep         jsonb := payload->'departure';
  v_res         jsonb := payload->'reservation';
  v_parts       jsonb := payload->'participants';
  v_part        jsonb;
BEGIN
  -- ── Segurança: apenas staff pode chamar ──
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'permission_denied: apenas staff pode criar experiências';
  END IF;

  -- ── 1. Experiência ──
  INSERT INTO public.experiences (
    title, slug, subtitle, description,
    location, category, difficulty,
    base_price, duration_hours, max_participants,
    cover_image_url, is_active, featured
  ) VALUES (
    v_exp->>'title',
    v_exp->>'slug',
    NULLIF(v_exp->>'subtitle', ''),
    NULLIF(v_exp->>'description', ''),
    NULLIF(v_exp->>'location', ''),
    NULLIF(v_exp->>'category', ''),
    NULLIF(v_exp->>'difficulty', ''),
    COALESCE((v_exp->>'base_price')::numeric, 0),
    NULLIF(v_exp->>'duration_hours', '')::numeric,
    NULLIF(v_exp->>'max_participants', '')::integer,
    NULLIF(v_exp->>'cover_image_url', ''),
    COALESCE((v_exp->>'is_active')::boolean, true),
    COALESCE((v_exp->>'featured')::boolean, false)
  )
  RETURNING id INTO v_exp_id;

  -- ── 2. Saída (opcional) ──
  IF v_dep IS NOT NULL AND (v_dep->>'start_at') IS NOT NULL THEN
    INSERT INTO public.departures (
      experience_id, title, start_at, end_at,
      meeting_point, capacity, price, status
    ) VALUES (
      v_exp_id,
      NULLIF(v_dep->>'title', ''),
      (v_dep->>'start_at')::timestamptz,
      NULLIF(v_dep->>'end_at', '')::timestamptz,
      NULLIF(v_dep->>'meeting_point', ''),
      NULLIF(v_dep->>'capacity', '')::integer,
      NULLIF(v_dep->>'price', '')::numeric,
      COALESCE(NULLIF(v_dep->>'status', ''), 'scheduled')
    )
    RETURNING id INTO v_dep_id;
  END IF;

  -- ── 3. Reserva manual (opcional) ──
  IF v_res IS NOT NULL AND (v_res->>'customer_name') IS NOT NULL THEN
    INSERT INTO public.reservations (
      experience_id, departure_id,
      customer_name, customer_email, customer_phone,
      payment_method, reservation_status,
      total_amount, amount_paid, notes
    ) VALUES (
      v_exp_id,
      v_dep_id,
      v_res->>'customer_name',
      NULLIF(v_res->>'customer_email', ''),
      NULLIF(v_res->>'customer_phone', ''),
      NULLIF(v_res->>'payment_method', ''),
      COALESCE(NULLIF(v_res->>'reservation_status', ''), 'reserved'),
      COALESCE((v_res->>'total_amount')::numeric, 0),
      COALESCE((v_res->>'amount_paid')::numeric, 0),
      NULLIF(v_res->>'notes', '')
    )
    RETURNING id INTO v_res_id;
  END IF;

  -- ── 4. Participantes (opcional) ──
  IF v_res_id IS NOT NULL AND jsonb_array_length(COALESCE(v_parts, '[]'::jsonb)) > 0 THEN
    FOR v_part IN SELECT * FROM jsonb_array_elements(v_parts) LOOP
      INSERT INTO public.participants (reservation_id, name, profile_type, birthdate)
      VALUES (
        v_res_id,
        NULLIF(v_part->>'name', ''),
        NULLIF(v_part->>'profile_type', ''),
        NULLIF(v_part->>'birthdate', '')::date
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'experience_id', v_exp_id,
    'departure_id',  v_dep_id,
    'reservation_id', v_res_id
  );
END;
$$;

-- Permissão de execução para usuários autenticados
-- (a função já valida is_staff() internamente)
GRANT EXECUTE ON FUNCTION public.create_experience_bundle(jsonb) TO authenticated;
