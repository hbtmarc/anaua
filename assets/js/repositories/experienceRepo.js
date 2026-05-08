/**
 * @fileoverview Repositório de Experiências — Anauá Ecoturismo
 *
 * Encapsula todas as queries à tabela `public.experiences` e
 * `public.departures` no Supabase.
 *
 * Convenção: funções retornam { data, error } — mesma forma
 * que o próprio Supabase client retorna, para facilitar o entendimento.
 */

import { supabase } from '../supabaseClient.js';

/**
 * Colunas confirmadas na tabela public.experiences conforme SELECT bem-sucedido no admin.
 * Estas colunas SEMPRE existem e podem ser incluídas com segurança.
 */
const CONFIRMED_COLUMNS = new Set([
  'title', 'slug', 'location', 'category', 'difficulty',
  'base_price', 'is_active', 'cover_image_url',
  'short_description',
]);

/**
 * Colunas estendidas — adicionadas via migration experiences_extended_fields.sql.
 * Só são enviadas se o valor estiver presente E não for nulo/vazio.
 * Se a migration ainda não foi executada, o Supabase retornará erro de coluna
 * desconhecida — nesse caso, aplique a migration primeiro.
 * @see supabase/migrations/experiences_extended_fields.sql
 */
const EXTENDED_COLUMNS = new Set([
  'subtitle', 'short_description', 'description', 'duration_text', 'duration_hours',
  'max_participants', 'is_new', 'featured', 'region', 'highlights', 'includes',
  'excludes', 'what_to_bring', 'gallery', 'currency',
  'min_age', 'distance_km', 'elevation_gain_m', 'cancellation_policy',
]);

/**
 * Constrói um payload seguro para INSERT/UPDATE em public.experiences.
 * - Inclui apenas campos com valores não-nulos e não-vazios.
 * - Se um campo estendido for fornecido mas a migration não tiver sido aplicada,
 *   o Supabase retornará um erro claro de schema.
 * - cover_image_url vazio é normalizado para null (nunca envia string vazia).
 *
 * @param {object} raw — campos brutos do formulário
 * @param {{ includeExtended?: boolean }} [opts]
 * @returns {object} payload pronto para o Supabase
 */
export function buildExperiencePayload(raw, { includeExtended = true } = {}) {
  const payload = {};

  for (const key of CONFIRMED_COLUMNS) {
    if (key in raw) {
      const val = raw[key];
      // Normaliza cover_image_url vazio para null
      if (key === 'cover_image_url') {
        payload[key] = (val && String(val).trim() !== '') ? String(val).trim() : null;
      } else {
        payload[key] = val ?? null;
      }
    }
  }

  if (includeExtended) {
    for (const key of EXTENDED_COLUMNS) {
      if (!(key in raw)) continue;
      const val = raw[key];
      if (val === null || val === undefined || val === '') {
        // Envia null explícito para limpar o campo ao editar
        payload[key] = null;
        continue;
      }
      payload[key] = val;
    }
  } else {
    console.warn(
      '[experienceRepo] Campos estendidos (subtitle, description, duration_hours, max_participants) ' +
      'foram omitidos pois includeExtended=false. ' +
      'Execute supabase/migrations/experiences_extended_fields.sql antes de ativá-los.'
    );
  }

  return payload;
}

/**
 * Converte uma linha do Supabase (snake_case) para o formato que os
 * componentes do projeto esperam (camelCase).
 * Isso isola o restante do código de mudanças no schema do banco.
 *
 * @param {object} row - Linha retornada pelo Supabase
 * @returns {object} - Objeto no formato esperado pelos componentes
 */
/**
 * Mapeia dificuldade do banco (PT livre) para os slugs usados nos filtros do site.
 * Garante compatibilidade entre o que o backoffice salva e o que a listagem filtra.
 */
const DIFFICULTY_MAP = {
  'fácil':        'iniciante',
  'facil':        'iniciante',
  'easy':         'iniciante',
  'iniciante':    'iniciante',
  'moderada':     'moderado',
  'moderado':     'moderado',
  'moderate':     'moderado',
  'difícil':      'aventura',
  'dificil':      'aventura',
  'hard':         'aventura',
  'aventura':     'aventura',
  'muito difícil':'aventura',
  'muito dificil':'aventura',
};

/**
 * Mapeia categoria do banco para os slugs usados nos filtros do site.
 */
const CATEGORY_MAP = {
  'day-experience':  'day-experience',
  'trilha':          'day-experience',
  'caminhada':       'day-experience',
  'expedition':      'expedition',
  'expedição':       'expedition',
  'expedicao':       'expedition',
  'event':           'event',
  'evento':          'event',
  'kids':            'kids',
};

/**
 * Garante que um valor do banco seja sempre um array.
 * Suporta arrays nativos, arrays JSON (string) e valores nulos.
 * @param {*} v
 * @returns {Array}
 */
function toArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null || v === '') return [];
  if (typeof v === 'string') {
    try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : [parsed]; }
    catch { return v.split(',').map(s => s.trim()).filter(Boolean); }
  }
  return [v];
}

function normalizeExperience(row) {
  const rawDifficulty = (row.difficulty ?? '').toLowerCase().trim();
  const rawCategory   = (row.category   ?? '').toLowerCase().trim();

  return {
    id:               row.id,            // UUID — fonte de verdade para joins no banco
    dbId:             row.id,            // alias explícito para uso em queries
    slug:             row.slug ?? null,  // identificador público para URLs
    category:         CATEGORY_MAP[rawCategory]   ?? rawCategory   ?? 'day-experience',
    status:           row.is_active ? 'active' : 'draft',
    title:            row.title        ?? '',
    subtitle:         row.subtitle     ?? row.short_description?.slice(0, 120) ?? row.description?.slice(0, 120) ?? '',
    shortDescription: row.short_description ?? row.subtitle ?? '',
    description:      row.description  ?? '',
    coverImage:       (row.cover_image_url && row.cover_image_url.trim() !== '' && row.cover_image_url !== 'null' && row.cover_image_url !== 'undefined')
                        ? row.cover_image_url
                        : 'assets/img/placeholder.svg',
    gallery:          toArray(row.gallery),
    durationHours:    row.duration_hours  ?? null,
    durationText:     row.duration_text   ?? null,
    durationLabel:    row.duration_text   ?? row.duration_label  ?? (row.duration_hours ? `${row.duration_hours}h` : '—'),
    minAge:           row.min_age          ?? null,
    maxParticipants:  row.max_participants ?? null,
    difficulty:       DIFFICULTY_MAP[rawDifficulty] ?? rawDifficulty ?? null,
    distanceKm:       row.distance_km      ?? null,
    elevationGainM:   row.elevation_gain_m ?? null,
    location:         row.location         ?? '',
    region:           row.region           ?? '',
    pricePerPerson:   row.price_per_person ?? row.base_price ?? 0,
    priceChildren:    row.price_children   ?? null,
    currency:         row.currency         ?? 'BRL',
    includes:         toArray(row.includes),
    excludes:         toArray(row.excludes),
    whatToBring:      toArray(row.what_to_bring),
    cancellationPolicy: row.cancellation_policy ?? null,
    isFeatured:       row.featured         ?? false,
    isNew:            row.is_new           ?? false,
    highlights:       toArray(row.highlights),
    nextExits:        [],                  // saídas carregadas separadamente via listDeparturesByExperience
    departures:       row.departures       ?? [],
    createdAt:        row.created_at,
    updatedAt:        row.updated_at,
  };
}

/**
 * Busca uma experiência ativa pelo seu slug público.
 *
 * @param {string} slug - valor da coluna experiences.slug
 * @returns {Promise<{ data: object|null, error: object|null }>}
 */
export async function getExperienceBySlug(slug) {
  const { data, error } = await supabase
    .from('experiences')
    .select('*')
    .eq('slug', slug)
    .neq('is_active', false)   // inclui true e null
    .single();

  if (error) {
    console.warn('[experienceRepo] Experiência não encontrada por slug:', slug, error.message);
    return { data: null, error };
  }

  console.log('[experienceRepo] Experiência carregada por slug ✓', slug);
  return { data: normalizeExperience(data), error: null };
}

/**
 * Busca todas as experiências ativas (is_active = true).
 * Ordena por: destaques primeiro, depois mais recentes.
 *
 * Nota: a tabela usa a coluna booleana `is_active`, não `status`.
 *
 * @returns {Promise<{ data: object[]|null, error: object|null }>}
 */
export async function listExperiences() {
  const { data, error } = await supabase
    .from('experiences')
    .select('*')
    .neq('is_active', false)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[experienceRepo] Erro em experiências — listExperiences:', error.message);
    return { data: null, error };
  }

  console.log(`[experienceRepo] Experiências carregadas ✓ (${data.length} registros)`);
  return { data: data.map(normalizeExperience), error: null };
}

/**
 * Busca uma experiência pelo UUID.
 * @param {string} id - UUID da experiência
 */
export async function getExperienceById(id) {
  const { data, error } = await supabase
    .from('experiences')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('[experienceRepo] Erro em experiências — getExperienceById:', error.message);
    return { data: null, error };
  }
  return { data: normalizeExperience(data), error: null };
}

/**
 * Cria uma nova experiência.
 * @param {object} payload - Campos da tabela public.experiences (snake_case)
 */
export async function createExperience(payload) {
  const safePayload = buildExperiencePayload(payload);
  const { data, error } = await supabase
    .from('experiences')
    .insert(safePayload)
    .select()
    .single();

  if (error) {
    console.error('[experienceRepo] Erro em experiências — createExperience:', error.message);
    // Dica amigável se o erro for de coluna desconhecida
    if (error.message?.includes('column') && error.message?.includes('does not exist')) {
      console.warn(
        '[experienceRepo] Coluna não encontrada no banco. ' +
        'Execute supabase/migrations/experiences_extended_fields.sql no Supabase Dashboard.'
      );
    }
    return { data: null, error };
  }
  console.log('[experienceRepo] Experiência criada ✓', data.id);
  return { data: normalizeExperience(data), error: null };
}

/**
 * Atualiza uma experiência existente pelo UUID.
 * @param {string} id - UUID da experiência
 * @param {object} payload - Campos a atualizar
 */
export async function updateExperience(id, payload) {
  const safePayload = buildExperiencePayload(payload);
  const { data, error } = await supabase
    .from('experiences')
    .update(safePayload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[experienceRepo] Erro em experiências — updateExperience:', error.message);
    if (error.message?.includes('column') && error.message?.includes('does not exist')) {
      console.warn(
        '[experienceRepo] Coluna não encontrada no banco. ' +
        'Execute supabase/migrations/experiences_extended_fields.sql no Supabase Dashboard.'
      );
    }
    return { data: null, error };
  }
  console.log('[experienceRepo] Experiência atualizada ✓', id);
  return { data: normalizeExperience(data), error: null };
}

/**
 * Soft-deleta uma experiência setando is_active = false.
 * @param {string} id - UUID da experiência
 */
export async function deleteExperience(id) {
  const { error } = await supabase
    .from('experiences')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    console.error('[experienceRepo] Erro em experiências — deleteExperience:', error.message);
    return { error };
  }
  console.log('[experienceRepo] Experiência excluída (soft) ✓', id);
  return { error: null };
}

/**
 * Busca as saídas programadas de uma experiência específica.
 * Traz apenas saídas com status 'scheduled' e data futura.
 *
 * @param {string} experienceId - ID da experiência (UUID ou slug)
 * @returns {Promise<{ data: object[]|null, error: object|null }>}
 */
export async function listDeparturesByExperience(experienceId) {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('departures')
    .select('id, experience_id, title, start_at, end_at, meeting_point, capacity, price, status, created_at, updated_at')
    .eq('experience_id', experienceId)
    .eq('status', 'scheduled')
    .gte('start_at', now)
    .order('start_at', { ascending: true });

  if (error) {
    console.error(`[hardening-2.1] Erro ao carregar saídas (experience: ${experienceId}):`, error.message);
    return { data: null, error };
  }

  console.log(`[hardening-2.1] Saídas carregadas ✓ (${data.length} para experiência ${experienceId})`);
  return { data, error: null };
}

/**
 * Lista todas as saídas (todos os status, todas as datas). Uso exclusivo do backoffice.
 */
export async function listAllDepartures() {
  const { data, error } = await supabase
    .from('departures')
    .select('id, experience_id, title, start_at, end_at, meeting_point, capacity, price, status, created_at, updated_at, experiences(title)')
    .order('start_at', { ascending: false });

  if (error) {
    console.error('[hardening-2.1] Erro ao carregar todas as saídas:', error.message);
    return { data: null, error };
  }
  console.log(`[hardening-2.1] Saídas carregadas ✓ (total: ${data.length})`);
  return { data, error: null };
}

/**
 * Cria uma nova saída.
 * @param {{ experience_id, title, start_at, capacity, price, status }} payload
 */
export async function createDeparture(payload) {
  const { data, error } = await supabase
    .from('departures')
    .insert(payload)
    .select('id, experience_id, title, start_at, end_at, meeting_point, capacity, price, status')
    .single();

  if (error) {
    console.error('[hardening-2.1] Erro ao criar saída:', error.message);
    return { data: null, error };
  }
  console.log('[hardening-2.1] Saída criada ✓', data.id);
  return { data, error: null };
}

/**
 * Atualiza campos de uma saída existente.
 * @param {string} id
 * @param {object} payload
 */
export async function updateDeparture(id, payload) {
  const { data, error } = await supabase
    .from('departures')
    .update(payload)
    .eq('id', id)
    .select('id, experience_id, title, start_at, end_at, meeting_point, capacity, price, status')
    .single();

  if (error) {
    console.error('[hardening-2.1] Erro ao atualizar saída:', error.message);
    return { data: null, error };
  }
  console.log('[hardening-2.1] Saída atualizada ✓', id);
  return { data, error: null };
}

/**
 * Altera o status de uma saída (scheduled | cancelled | sold_out).
 * @param {string} id
 * @param {'scheduled'|'cancelled'|'sold_out'} status
 */
export async function setDepartureStatus(id, status) {
  const { data, error } = await supabase
    .from('departures')
    .update({ status })
    .eq('id', id)
    .select('id, status')
    .single();

  if (error) {
    console.error('[hardening-2.1] Erro ao alterar status da saída:', error.message);
    return { data: null, error };
  }
  console.log(`[hardening-2.1] Saída atualizada ✓ status=${status}`, id);
  return { data, error: null };
}

export async function deleteDeparture(id) {
  const { error } = await supabase
    .from('departures')
    .delete()
    .eq('id', id);
  if (error) {
    console.error('[anaua] Erro ao excluir saída:', error.message);
    return { error };
  }
  console.log('[anaua] Saída excluída ✓', id);
  return { error: null };
}

/**
 * Cria experiência + saída + reserva + participantes em uma única transação via RPC.
 * Se o RPC não existir (erro 42883), faz criação sequencial com rollback parcial.
 *
 * @param {{
 *   experience: object,
 *   departure?: object|null,
 *   reservation?: object|null,
 *   participants?: object[]|null,
 * }} bundle
 * @returns {Promise<{ data: { experience_id, departure_id, reservation_id }|null, error: object|null }>}
 */
export async function createExperienceBundle(bundle) {
  // ── Tenta RPC atômica ──────────────────────────────────────────────────────
  const { data: rpcData, error: rpcErr } = await supabase
    .rpc('create_experience_bundle', { payload: bundle });

  if (!rpcErr) {
    console.log('[bundle] Criado via RPC ✓', rpcData);
    return { data: rpcData, error: null };
  }

  // RPC não existe ainda → fallback sequencial (PGRST202 / 42883)
  const isNotFound = rpcErr.code === 'PGRST202' || rpcErr.code === '42883' || rpcErr.message?.includes('does not exist');
  if (!isNotFound) {
    console.error('[bundle] RPC falhou:', rpcErr.message);
    return { data: null, error: rpcErr };
  }
  console.warn('[bundle] RPC não disponível — usando fallback sequencial.');

  let expId = null;

  // 1. Experiência
  const { data: exp, error: expErr } = await createExperience(bundle.experience);
  if (expErr || !exp) return { data: null, error: expErr ?? new Error('createExperience sem dados') };
  expId = exp.id ?? exp.dbId;

  // 2. Saída
  let depId = null;
  if (bundle.departure?.start_at) {
    const { data: dep, error: depErr } = await createDeparture({ ...bundle.departure, experience_id: expId });
    if (depErr) {
      // Rollback: desativa experiência
      await supabase.from('experiences').update({ is_active: false }).eq('id', expId);
      return { data: null, error: { message: 'Experiência criada mas saída falhou: ' + depErr.message } };
    }
    depId = dep?.id ?? null;
  }

  // 3. Reserva
  let resId = null;
  if (bundle.reservation?.customer_name) {
    const resPayload = {
      experience_id:      expId,
      departure_id:       depId,
      customer_name:      bundle.reservation.customer_name,
      customer_email:     bundle.reservation.customer_email || null,
      customer_phone:     bundle.reservation.customer_phone || null,
      payment_method:     bundle.reservation.payment_method || null,
      reservation_status: bundle.reservation.reservation_status || 'reserved',
      total_amount:       bundle.reservation.total_amount || 0,
      amount_paid:        bundle.reservation.amount_paid || 0,
      notes:              bundle.reservation.notes || null,
    };
    const { data: res, error: resErr } = await supabase
      .from('reservations').insert(resPayload).select('id').single();
    if (resErr) {
      console.warn('[bundle] Reserva falhou (experiência foi criada):', resErr.message);
      return { data: { experience_id: expId, departure_id: depId, reservation_id: null }, error: { message: 'Reserva inicial falhou: ' + resErr.message } };
    }
    resId = res.id;

    // 4. Participantes
    if (bundle.participants?.length && resId) {
      const rows = bundle.participants
        .filter(p => p.name?.trim())
        .map(p => ({ reservation_id: resId, name: p.name, profile_type: p.profile_type || null, birthdate: p.birthdate || null }));
      if (rows.length) {
        const { error: partsErr } = await supabase.from('participants').insert(rows);
        if (partsErr) console.warn('[bundle] Participantes falharam (reserva criada):', partsErr.message);
      }
    }
  }

  console.log('[bundle] Criado via fallback sequencial ✓', { expId, depId, resId });
  return { data: { experience_id: expId, departure_id: depId, reservation_id: resId }, error: null };
}
