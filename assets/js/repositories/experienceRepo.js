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
function normalizeExperience(row) {
  return {
    id:               row.id,
    slug:             row.slug,
    category:         row.category,
    status:           row.status,
    title:            row.title,
    subtitle:         row.subtitle,
    description:      row.description,
    coverImage:       row.cover_image_url ?? row.cover_image ?? null,
    gallery:          row.gallery ?? [],
    durationHours:    row.duration_hours,
    durationLabel:    row.duration_label ?? `${row.duration_hours}h`,
    minAge:           row.min_age,
    maxParticipants:  row.max_participants,
    difficulty:       row.difficulty,
    distanceKm:       row.distance_km,
    elevationGainM:   row.elevation_gain_m,
    location:         row.location,
    region:           row.region,
    pricePerPerson:   row.price_per_person,
    priceChildren:    row.price_children,
    currency:         row.currency ?? 'BRL',
    includes:         row.includes ?? [],
    excludes:         row.excludes ?? [],
    whatToBring:      row.what_to_bring ?? [],
    cancellationPolicy: row.cancellation_policy,
    isFeatured:       row.featured,
    isNew:            row.is_new ?? false,
    departures:       row.departures ?? [],
    // Supabase retorna timestamps ISO — mantém como está
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
    .order('featured', { ascending: false })
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
