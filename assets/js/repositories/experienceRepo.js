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

function normalizeExperience(row) {
  const rawDifficulty = (row.difficulty ?? '').toLowerCase().trim();
  const rawCategory   = (row.category   ?? '').toLowerCase().trim();

  return {
    id:               row.slug ?? row.id,   // usa slug como ID para URLs
    slug:             row.slug ?? row.id,
    dbId:             row.id,
    category:         CATEGORY_MAP[rawCategory]   ?? rawCategory   ?? 'day-experience',
    status:           row.is_active ? 'active' : 'draft',
    title:            row.title        ?? '',
    subtitle:         row.subtitle     ?? row.description?.slice(0, 100) ?? '',
    description:      row.description  ?? '',
    coverImage:       row.cover_image_url ?? row.cover_image ?? null,
    gallery:          row.gallery      ?? [],
    durationHours:    row.duration_hours  ?? null,
    durationLabel:    row.duration_label  ?? (row.duration_hours ? `${row.duration_hours}h` : '—'),
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
    includes:         row.includes         ?? [],
    excludes:         row.excludes         ?? [],
    whatToBring:      row.what_to_bring    ?? [],
    cancellationPolicy: row.cancellation_policy ?? null,
    isFeatured:       row.featured         ?? false,
    isNew:            row.is_new           ?? false,
    departures:       row.departures       ?? [],
    createdAt:        row.created_at,
    updatedAt:        row.updated_at,
  };
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
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[experienceRepo] Erro ao carregar experiências:', error.message);
    return { data: null, error };
  }

  console.log(`[experienceRepo] Experiências carregadas com sucesso ✓ (${data.length} registros)`);
  return { data: data.map(normalizeExperience), error: null };
}

/**
 * Busca as saídas programadas de uma experiência específica.
 * Traz apenas saídas com status 'scheduled' e data futura.
 *
 * @param {string} experienceId - ID da experiência (UUID ou slug)
 * @returns {Promise<{ data: object[]|null, error: object|null }>}
 */
export async function listDeparturesByExperience(experienceId) {
  const now = new Date().toISOString(); // ISO completo para comparar com start_at (timestamptz)

  const { data, error } = await supabase
    .from('departures')
    .select('*')
    .eq('experience_id', experienceId)
    .eq('status', 'scheduled')
    .gte('start_at', now)
    .order('start_at', { ascending: true });

  if (error) {
    console.error(`[experienceRepo] Erro ao carregar saídas (experience: ${experienceId}):`, error.message);
    return { data: null, error };
  }

  console.log(`[experienceRepo] Saídas carregadas com sucesso ✓ (${data.length} para experiência ${experienceId})`);
  return { data, error: null };
}
