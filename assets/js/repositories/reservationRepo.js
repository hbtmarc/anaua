/**
 * @fileoverview reservationRepo.js — Operações Supabase para reservas, participantes e pagamentos.
 *
 * Colunas confirmadas no schema:
 *   reservations : id, user_id, experience_id, departure_id, customer_name,
 *                  customer_email, customer_phone, reservation_status,
 *                  total_amount, amount_paid, payment_method, notes, created_at
 *   participants : id, reservation_id, full_name, profile_type, birthdate
 *   payments     : id, reservation_id, amount, method, status, paid_at
 *
 * Execute supabase/migrations/booking_schema.sql antes de usar em produção.
 */

import { supabase } from '../supabaseClient.js';

// ─── Reservations ─────────────────────────────────────────────────────────────

/**
 * Insere uma reserva em public.reservations.
 *
 * @param {{
 *   userId: string|null,
 *   reservationCode: string,
 *   experienceId: string,
 *   exitId: string|null,
 *   meetingPointId: string|null,
 *   payer: { fullName:string, email:string, phone:string, cpf:string, birthdate:string },
 *   totalAmount: number,
 *   amountPaid: number,
 *   paymentStatus: string,
 *   reservationStatus: string,
 *   paymentMethod: string,
 *   termsAccepted: boolean,
 *   notes: string|null,
 * }} data
 * @returns {Promise<{ ok: boolean, id: string|null, error: string|null }>}
 */
export async function insertReservation({
  userId, experienceId, exitId,
  boardingPointId,
  payer, totalAmount, amountPaid, reservationStatus,
  paymentMethod, notes,
}) {
  // Normalise status to values accepted by the DB check constraint
  // After migration 20260507_fix_schema_and_rls.sql the constraint accepts all app values.
  // Only 'draft' needs mapping; everything else passes through.
  const STATUS_MAP = {
    draft: 'pending',
  };
  const dbStatus = STATUS_MAP[reservationStatus] ?? reservationStatus ?? 'pending';

  const baseRow = {
    user_id:            userId ?? null,
    customer_name:      payer?.fullName ?? null,
    customer_email:     payer?.email ?? null,
    customer_phone:     payer?.phone ?? null,
    total_amount:       totalAmount,
    amount_paid:        amountPaid ?? 0,
    reservation_status: dbStatus,
    payment_method:     paymentMethod ?? null,
    notes:              notes ?? null,
  };

  // Optional columns — added only when we expect them to exist in the DB
  const fullRow = {
    ...baseRow,
    experience_id: experienceId,
    departure_id:  exitId ?? null,
  };
  if (boardingPointId) fullRow.boarding_point_id = boardingPointId;

  // Try insert with all optional FK columns first
  let { data, error } = await supabase
    .from('reservations')
    .insert(fullRow)
    .select('id')
    .single();

  // If FK columns don't exist yet (migration pending), retry with base columns only
  if (error && (error.code === '42703' || error.message?.includes('column') || error.message?.includes('does not exist'))) {
    console.warn('[reservationRepo] Colunas FK ausentes — retentando sem experience_id/departure_id/boarding_point_id. Execute a migration fix_schema_and_rls.sql.');
    ({ data, error } = await supabase
      .from('reservations')
      .insert(baseRow)
      .select('id')
      .single());
  }

  if (error) {
    console.warn('[reservationRepo] insertReservation erro:', error.message);
    return { ok: false, id: null, error: error.message };
  }
  console.log('[reservationRepo] Reserva inserida ✓ id:', data.id);
  return { ok: true, id: data.id, error: null };
}

// ─── Participants ─────────────────────────────────────────────────────────────

/**
 * Insere participantes em public.participants vinculados a uma reserva.
 *
 * @param {string} reservationId
 * @param {Array<{ fullName:string, docNumber:string, birthdate:string, profile:string, isResponsible:boolean, observations:string|null }>} participants
 * @returns {Promise<{ ok: boolean, error: string|null }>}
 */
export async function insertParticipants(reservationId, participants) {
  if (!participants?.length) return { ok: true, error: null };

  // Insert all available columns. birthdate is nullable — omit if absent.
  const rows = participants.map(p => {
    const row = {
      reservation_id:  reservationId,
      full_name:       p.fullName ?? p.full_name ?? p.name ?? null,
      profile_type:    p.profile  ?? p.profileType ?? p.profile_type ?? null,
    };
    const bd = p.birthdate ?? p.birth_date ?? null;
    if (bd) row.birthdate = bd;
    const doc = p.docNumber ?? p.document_number ?? null;
    if (doc) row.document_number = doc;
    return row;
  });

  const { data: inserted, error } = await supabase
    .from('participants')
    .insert(rows)
    .select('id');
  if (error) {
    console.warn('[reservationRepo] insertParticipants erro:', error.message, '| código:', error.code, '| rows:', JSON.stringify(rows));
    return { ok: false, count: 0, error: error.message };
  }
  console.log('[reservationRepo] Participantes inseridos ✓', inserted?.length ?? rows.length);
  return { ok: true, count: inserted?.length ?? rows.length, error: null };
}

// ─── Payments ─────────────────────────────────────────────────────────────────

/**
 * Insere um registro manual de pagamento em public.payments.
 *
 * @param {{
 *   reservationId: string,
 *   method: string,
 *   amountPaid: number,
 *   status: 'pending'|'paid'|'partial',
 *   notes: string|null,
 * }} data
 * @returns {Promise<{ ok: boolean, error: string|null }>}
 */
export async function insertPaymentRecord({ reservationId, method, amountPaid, status, notes }) {
  // Normalise method to values the DB check constraint accepts
  const METHOD_MAP = {
    pix:            'pix',
    credit_card:    'credit_card',
    signal_balance: 'signal_balance',
    boleto:         'boleto',
  };
  const dbMethod = METHOD_MAP[method] ?? 'pix';

  const { error } = await supabase.from('payments').insert({
    reservation_id:   reservationId,
    method:           dbMethod,
    amount:           amountPaid ?? 0,
    status:           status ?? 'pending',
    paid_at:          (status === 'paid' || status === 'partial') ? new Date().toISOString() : null,
  });

  if (error) {
    console.warn('[reservationRepo] insertPaymentRecord erro:', error.message);
    return { ok: false, error: error.message };
  }
  console.log('[reservationRepo] Pagamento registrado ✓ status:', status);
  return { ok: true, error: null };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Busca todas as reservas do usuário logado.
 *
 * @param {string} userId — user.id do Supabase Auth
 * @returns {Promise<{ ok: boolean, data: object[], error: string|null }>}
 */
export async function getUserReservations(userId) {
  if (!userId) return { ok: false, data: [], error: 'userId ausente' };

  // Minimal safe columns guaranteed to exist in any reservations table
  const safeSelect = 'id, user_id, customer_name, customer_email, reservation_status, total_amount, amount_paid, payment_method, notes, created_at';

  // Try with joins first (requires experience_id / departure_id FK columns)
  const joinSelect = `${safeSelect}, experiences ( id, title, slug, cover_image_url ), departures ( id, start_at, end_at, title )`;

  const { data, error } = await supabase
    .from('reservations')
    .select(joinSelect)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (!error) return { ok: true, data: data ?? [], error: null };

  // Fallback: flat query without joins, only safe columns
  console.warn('[reservationRepo] Join query falhou, tentando sem joins:', error.message);
  const { data: flat, error: flatErr } = await supabase
    .from('reservations')
    .select(safeSelect)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (flatErr) {
    console.warn('[reservationRepo] getUserReservations erro:', flatErr.message);
    return { ok: false, data: [], error: flatErr.message };
  }
  return { ok: true, data: flat ?? [], error: null };
}
