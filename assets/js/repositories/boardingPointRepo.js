/**
 * @fileoverview boardingPointRepo.js
 * Catálogo reutilizável de pontos de embarque (boarding_points)
 * e junção saída↔ponto (departure_boarding_points).
 * Schema v2 — boarding_point_id FK, pontos personalizados via custom_label.
 * Uses window.anauaDb (Supabase CDN) — no bundler required.
 */

const CATALOG_TABLE = 'boarding_points';
const JUNCTION_TABLE = 'departure_boarding_points';

// Colunas permitidas — nunca enviar campos desconhecidos
const CATALOG_COLS = new Set(['name', 'address', 'reference', 'city', 'state', 'is_active', 'sort_order']);
const JUNCTION_COLS = new Set([
  'departure_id', 'boarding_point_id', 'pickup_at',
  'custom_label', 'custom_address', 'notes', 'is_active', 'sort_order',
]);

function getSupabase() {
  const db = window.anauaDb;
  if (!db) throw new Error('Supabase client (window.anauaDb) não disponível.');
  return db;
}

// ─── Normalizadores ──────────────────────────────────────────────────────────

/** Normaliza linha do catálogo (boarding_points) */
export function normalizeCatalogBP(row) {
  return {
    id:        row.id,
    name:      row.name,
    address:   row.address ?? null,
    reference: row.reference ?? null,
    city:      row.city ?? null,
    state:     row.state ?? null,
    isActive:  row.is_active !== false,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Normaliza linha da junção (departure_boarding_points),
 * incluindo o ponto do catálogo se vier via join.
 */
export function normalizeDepartureBP(row) {
  const catalog = row.boarding_points ?? null;
  return {
    id:              row.id,
    departureId:     row.departure_id,
    boardingPointId: row.boarding_point_id ?? null,
    pickupAt:        row.pickup_at,
    customLabel:     row.custom_label ?? null,
    customAddress:   row.custom_address ?? null,
    notes:           row.notes ?? null,
    isActive:        row.is_active !== false,
    sortOrder:       row.sort_order ?? 0,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
    // Ponto do catálogo (se veio via join)
    catalog:         catalog ? normalizeCatalogBP(catalog) : null,
    // Helpers de exibição:
    displayName:     row.custom_label || catalog?.name || '',
    displayAddress:  row.custom_address || catalog?.address || null,
    displayReference: catalog?.reference ?? null,
  };
}

// ─── Catálogo (boarding_points) ──────────────────────────────────────────────

/**
 * Lista pontos ativos do catálogo (uso público / seleção no formulário).
 * @returns {Promise<{ data: object[]|null, error: object|null }>}
 */
export async function listActiveBoardingPoints() {
  try {
    const db = getSupabase();
    const { data, error } = await db
      .from(CATALOG_TABLE)
      .select('id, name, address, reference, city, state, is_active, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) return { data: null, error };
    return { data: (data ?? []).map(normalizeCatalogBP), error: null };
  } catch (e) {
    return { data: null, error: { message: e.message } };
  }
}

/**
 * Lista TODOS os pontos do catálogo (incluindo inativos) — uso admin.
 * @returns {Promise<{ data: object[]|null, error: object|null }>}
 */
export async function listAllBoardingPoints() {
  try {
    const db = getSupabase();
    const { data, error } = await db
      .from(CATALOG_TABLE)
      .select('id, name, address, reference, city, state, is_active, sort_order, created_at')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) return { data: null, error };
    return { data: (data ?? []).map(normalizeCatalogBP), error: null };
  } catch (e) {
    return { data: null, error: { message: e.message } };
  }
}

/**
 * Cria um ponto no catálogo.
 * @param {{ name: string, address?: string, reference?: string, city?: string, state?: string, sort_order?: number }} payload
 */
export async function createBoardingPoint(payload) {
  try {
    const db = getSupabase();
    const row = {};
    for (const [k, v] of Object.entries(payload)) {
      if (CATALOG_COLS.has(k)) row[k] = v;
    }
    const { data, error } = await db.from(CATALOG_TABLE).insert(row).select('id').single();
    if (error) return { data: null, error };
    return { data, error: null };
  } catch (e) {
    return { data: null, error: { message: e.message } };
  }
}

/**
 * Atualiza um ponto do catálogo.
 * @param {string} id
 * @param {object} payload
 */
export async function updateBoardingPoint(id, payload) {
  try {
    const db = getSupabase();
    const row = {};
    for (const [k, v] of Object.entries(payload)) {
      if (CATALOG_COLS.has(k)) row[k] = v;
    }
    const { error } = await db.from(CATALOG_TABLE).update(row).eq('id', id);
    if (error) return { error };
    return { error: null };
  } catch (e) {
    return { error: { message: e.message } };
  }
}

/**
 * Exclui um ponto do catálogo apenas se não houver saídas vinculadas ativas.
 * @param {string} id
 * @returns {Promise<{ deleted: boolean, error: object|null }>}
 */
export async function deleteBoardingPoint(id) {
  try {
    const db = getSupabase();
    // Check usage in departure_boarding_points
    const { count, error: cntErr } = await db
      .from(JUNCTION_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('boarding_point_id', id);
    if (cntErr) return { deleted: false, error: cntErr };
    if (count > 0) return { deleted: false, error: { message: `Ponto está vinculado a ${count} saída(s). Desative-o em vez de excluir.` } };
    const { error } = await db.from(CATALOG_TABLE).delete().eq('id', id);
    if (error) return { deleted: false, error };
    return { deleted: true, error: null };
  } catch (e) {
    return { deleted: false, error: { message: e.message } };
  }
}

// ─── Junção (departure_boarding_points) ─────────────────────────────────────

/**
 * Lista pontos de embarque ativos de uma saída (uso público + cliente).
 * Inclui join ao catálogo para nome/endereço.
 * @param {string} departureId
 */
export async function listBoardingPointsByDeparture(departureId) {
  try {
    const db = getSupabase();
    const { data, error } = await db
      .from(JUNCTION_TABLE)
      .select(`
        id, departure_id, boarding_point_id, pickup_at,
        custom_label, custom_address, notes, is_active, sort_order,
        boarding_points ( id, name, address, reference, city )
      `)
      .eq('departure_id', departureId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('pickup_at', { ascending: true });
    if (error) return { data: null, error };
    return { data: (data ?? []).map(normalizeDepartureBP), error: null };
  } catch (e) {
    return { data: null, error: { message: e.message } };
  }
}

/**
 * Lista TODOS os pontos de embarque de uma saída (incluindo inativos) — uso admin.
 * @param {string} departureId
 */
export async function listAllBoardingPointsByDeparture(departureId) {
  try {
    const db = getSupabase();
    const { data, error } = await db
      .from(JUNCTION_TABLE)
      .select(`
        id, departure_id, boarding_point_id, pickup_at,
        custom_label, custom_address, notes, is_active, sort_order,
        boarding_points ( id, name, address, reference, city )
      `)
      .eq('departure_id', departureId)
      .order('sort_order', { ascending: true })
      .order('pickup_at', { ascending: true });
    if (error) return { data: null, error };
    return { data: (data ?? []).map(normalizeDepartureBP), error: null };
  } catch (e) {
    return { data: null, error: { message: e.message } };
  }
}

/**
 * Busca pontos de embarque ativos para múltiplas saídas (uso detail.js).
 * @param {string[]} departureIds
 * @returns {Promise<{ data: Record<string, object[]>, error: object|null }>}
 */
export async function listBoardingPointsForDepartures(departureIds) {
  if (!departureIds || departureIds.length === 0) return { data: {}, error: null };
  try {
    const db = getSupabase();
    const { data, error } = await db
      .from(JUNCTION_TABLE)
      .select(`
        id, departure_id, boarding_point_id, pickup_at,
        custom_label, custom_address, notes, is_active, sort_order,
        boarding_points ( id, name, address, reference, city )
      `)
      .in('departure_id', departureIds)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('pickup_at', { ascending: true });
    if (error) return { data: {}, error };
    const map = {};
    for (const row of data ?? []) {
      const norm = normalizeDepartureBP(row);
      if (!map[norm.departureId]) map[norm.departureId] = [];
      map[norm.departureId].push(norm);
    }
    return { data: map, error: null };
  } catch (e) {
    return { data: {}, error: { message: e.message } };
  }
}

/**
 * Salva (replace) os pontos de embarque de uma saída:
 * apaga os existentes e re-insere os novos.
 *
 * @param {string} departureId
 * @param {Array<{
 *   boardingPointId: string|null,
 *   pickupAt: string,
 *   customLabel?: string|null,
 *   customAddress?: string|null,
 *   notes?: string|null,
 *   isActive?: boolean,
 *   sortOrder?: number,
 * }>} selections
 */
export async function saveDepartureBoardingPoints(departureId, selections) {
  try {
    const db = getSupabase();

    const { error: delErr } = await db
      .from(JUNCTION_TABLE)
      .delete()
      .eq('departure_id', departureId);
    if (delErr) return { error: delErr };

    if (!selections || selections.length === 0) return { error: null };

    const rows = selections.map((s, i) => {
      const row = {
        departure_id:      departureId,
        boarding_point_id: s.boardingPointId ?? null,
        pickup_at:         s.pickupAt,
        custom_label:      s.customLabel ?? null,
        custom_address:    s.customAddress ?? null,
        notes:             s.notes ?? null,
        is_active:         s.isActive !== false,
        sort_order:        s.sortOrder ?? i,
      };
      // Só inclui chaves permitidas
      const clean = {};
      for (const [k, v] of Object.entries(row)) {
        if (JUNCTION_COLS.has(k) || k === 'departure_id') clean[k] = v;
      }
      return clean;
    });

    const { error } = await db.from(JUNCTION_TABLE).insert(rows);
    if (error) return { error };
    return { error: null };
  } catch (e) {
    return { error: { message: e.message } };
  }
}

// ─── Aliases legados (compatibilidade com código anterior) ───────────────────
// Esses nomes existiam no schema v1. Redireciona para as novas funções.

/** @deprecated Use saveDepartureBoardingPoints */
export async function createBoardingPoints(departureId, points) {
  const selections = (points ?? []).map((p, i) => ({
    boardingPointId: p.boarding_point_id ?? p.boardingPointId ?? null,
    pickupAt:        p.pickup_at ?? p.pickupAt,
    customLabel:     p.custom_label ?? p.customLabel ?? p.label ?? null,
    customAddress:   p.custom_address ?? p.customAddress ?? p.address ?? null,
    notes:           p.notes ?? null,
    isActive:        p.is_active ?? p.isActive ?? true,
    sortOrder:       p.order_index ?? p.sortOrder ?? i,
  }));
  return saveDepartureBoardingPoints(departureId, selections);
}

/** @deprecated Use saveDepartureBoardingPoints */
export async function replaceBoardingPoints(departureId, points) {
  return createBoardingPoints(departureId, points);
}
