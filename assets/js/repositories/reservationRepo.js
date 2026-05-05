/**
 * @fileoverview reservationRepo.js — Operações Supabase para reservas, participantes e pagamentos.
 *
 * Colunas confirmadas no schema:
 *   reservations : id, user_id, experience_id, departure_id, customer_name,
 *                  customer_email, customer_phone, reservation_status,
 *                  total_amount, amount_paid, payment_method, notes, created_at
 *   participants : id, reservation_id, name, profile_type, birthdate
 *   payments     : id, reservation_id, amount, payment_method, status, paid_at
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
  payer, totalAmount, amountPaid, reservationStatus,
  paymentMethod, notes,
}) {
  const { data, error } = await supabase
    .from('reservations')
    .insert({
      user_id:            userId ?? null,
      experience_id:      experienceId,
      departure_id:       exitId ?? null,      // exitId = departure UUID
      customer_name:      payer?.fullName ?? null,
      customer_email:     payer?.email ?? null,
      customer_phone:     payer?.phone ?? null,
      total_amount:       totalAmount,
      amount_paid:        amountPaid ?? 0,
      reservation_status: reservationStatus ?? 'reserved',
      payment_method:     paymentMethod ?? null,
      notes:              notes ?? null,
    })
    .select('id')
    .single();

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

  // Confirmed columns: id, reservation_id, name, profile_type, birthdate
  const rows = participants.map(p => ({
    reservation_id: reservationId,
    name:           p.fullName ?? p.name ?? null,
    profile_type:   p.profile  ?? p.profile_type ?? null,
    birthdate:      p.birthdate ?? null,
  }));

  const { error } = await supabase.from('participants').insert(rows);
  if (error) {
    console.warn('[reservationRepo] insertParticipants erro:', error.message);
    return { ok: false, error: error.message };
  }
  console.log('[reservationRepo] Participantes inseridos ✓', rows.length);
  return { ok: true, error: null };
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
  const { error } = await supabase.from('payments').insert({
    reservation_id:   reservationId,
    payment_method:   method ?? null,
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

  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[reservationRepo] getUserReservations erro:', error.message);
    return { ok: false, data: [], error: error.message };
  }
  return { ok: true, data: data ?? [], error: null };
}
