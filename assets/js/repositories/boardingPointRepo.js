/**
 * @fileoverview boardingPointRepo.js
 * CRUD helpers for public.departure_boarding_points.
 * Uses window.anauaDb (Supabase CDN) — no bundler required.
 */

const TABLE = 'departure_boarding_points';

// Columns we're allowed to send to the DB — never unknown fields
const ALLOWED_COLS = new Set([
  'departure_id', 'label', 'address', 'pickup_at',
  'order_index', 'is_active', 'notes',
]);

function getSupabase() {
  const db = window.anauaDb;
  if (!db) throw new Error('Supabase client (window.anauaDb) não disponível.');
  return db;
}

/**
 * Normalizes a raw DB row into a clean object.
 * @param {object} row
 * @returns {object}
 */
export function normalizeBoardingPoint(row) {
  return {
    id:          row.id,
    departureId: row.departure_id,
    label:       row.label ?? '',
    address:     row.address ?? null,
    pickupAt:    row.pickup_at,
    orderIndex:  row.order_index ?? 0,
    isActive:    row.is_active !== false,
    notes:       row.notes ?? null,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  };
}

/**
 * Strips unknown columns and builds a safe insert/update payload.
 * @param {object} point - Raw form data
 * @param {string} [departureId] - Override departure_id
 * @returns {object}
 */
export function buildBoardingPointPayload(point, departureId) {
  const raw = {
    departure_id: departureId ?? point.departure_id ?? point.departureId,
    label:        (point.label ?? '').trim() || null,
    address:      (point.address ?? '').trim() || null,
    pickup_at:    point.pickup_at ?? point.pickupAt,
    order_index:  point.order_index ?? point.orderIndex ?? 0,
    is_active:    point.is_active ?? point.isActive ?? true,
    notes:        (point.notes ?? '').trim() || null,
  };
  const payload = {};
  for (const [k, v] of Object.entries(raw)) {
    if (ALLOWED_COLS.has(k)) payload[k] = v;
  }
  return payload;
}

/**
 * Lists all active boarding points for a departure, ordered by order_index.
 * Public-safe (RLS allows active points for scheduled/sold_out departures).
 * @param {string} departureId
 * @returns {Promise<{ data: object[]|null, error: object|null }>}
 */
export async function listBoardingPointsByDeparture(departureId) {
  try {
    const db = getSupabase();
    const { data, error } = await db
      .from(TABLE)
      .select('id, departure_id, label, address, pickup_at, order_index, is_active, notes')
      .eq('departure_id', departureId)
      .eq('is_active', true)
      .order('order_index', { ascending: true })
      .order('pickup_at', { ascending: true });
    if (error) return { data: null, error };
    return { data: (data ?? []).map(normalizeBoardingPoint), error: null };
  } catch (e) {
    return { data: null, error: { message: e.message } };
  }
}

/**
 * Lists ALL boarding points for a departure (including inactive), for admin use.
 * @param {string} departureId
 * @returns {Promise<{ data: object[]|null, error: object|null }>}
 */
export async function listAllBoardingPointsByDeparture(departureId) {
  try {
    const db = getSupabase();
    const { data, error } = await db
      .from(TABLE)
      .select('id, departure_id, label, address, pickup_at, order_index, is_active, notes')
      .eq('departure_id', departureId)
      .order('order_index', { ascending: true })
      .order('pickup_at', { ascending: true });
    if (error) return { data: null, error };
    return { data: (data ?? []).map(normalizeBoardingPoint), error: null };
  } catch (e) {
    return { data: null, error: { message: e.message } };
  }
}

/**
 * Inserts boarding points for a departure (bulk insert).
 * @param {string} departureId
 * @param {{ label: string, address?: string, pickup_at: string, order_index?: number, is_active?: boolean, notes?: string }[]} points
 * @returns {Promise<{ data: object[]|null, error: object|null }>}
 */
export async function createBoardingPoints(departureId, points) {
  if (!points || points.length === 0) return { data: [], error: null };
  try {
    const db = getSupabase();
    const rows = points.map((p, i) => buildBoardingPointPayload({ ...p, order_index: p.order_index ?? i }, departureId));
    const { data, error } = await db.from(TABLE).insert(rows).select('id');
    if (error) return { data: null, error };
    return { data, error: null };
  } catch (e) {
    return { data: null, error: { message: e.message } };
  }
}

/**
 * Replaces all boarding points for a departure:
 * deletes existing rows then re-inserts provided points.
 * @param {string} departureId
 * @param {{ label: string, address?: string, pickup_at: string, order_index?: number, is_active?: boolean, notes?: string }[]} points
 * @returns {Promise<{ data: object[]|null, error: object|null }>}
 */
export async function replaceBoardingPoints(departureId, points) {
  try {
    const db = getSupabase();
    const { error: delErr } = await db.from(TABLE).delete().eq('departure_id', departureId);
    if (delErr) return { data: null, error: delErr };
    if (!points || points.length === 0) return { data: [], error: null };
    return createBoardingPoints(departureId, points);
  } catch (e) {
    return { data: null, error: { message: e.message } };
  }
}
