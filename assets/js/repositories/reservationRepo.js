/**
 * @fileoverview reservationRepo.js — Operações Supabase para reservas, participantes e pagamentos.
 *
 * Tabelas necessárias em public:
 *   - reservations
 *   - participants
 *   - payments
 *
 * Todas as operações são defensivas: erros de RLS são registrados no console
 * mas não quebram a UI — o fluxo de reserva continua com fallback localStorage.
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
  userId, reservationCode, experienceId, exitId, meetingPointId,
  payer, totalAmount, amountPaid, paymentStatus, reservationStatus,
  paymentMethod, termsAccepted, notes,
}) {
  const { data, error } = await supabase
    .from('reservations')
    .insert({
      user_id:            userId ?? null,
      reservation_code:   reservationCode,
      experience_id:      experienceId,
      exit_id:            exitId ?? null,
      meeting_point_id:   meetingPointId ?? null,
      customer_name:      payer.fullName,
      customer_email:     payer.email,
      customer_phone:     payer.phone ?? null,
      customer_cpf:       payer.cpf ?? null,
      customer_birthdate: payer.birthdate ?? null,
      total_amount:       totalAmount,
      amount_paid:        amountPaid,
      payment_status:     paymentStatus,
      reservation_status: reservationStatus,
      payment_method:     paymentMethod ?? null,
      terms_accepted:     termsAccepted ?? false,
      notes:              notes ?? null,
    })
    .select('id')
    .single();

  if (error) {
    console.warn('[reservationRepo] insertReservation erro:', error.message);
    return { ok: false, id: null, error: error.message };
  }
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

  const rows = participants.map(p => ({
    reservation_id: reservationId,
    full_name:      p.fullName,
    doc_number:     p.docNumber ?? null,
    birthdate:      p.birthdate ?? null,
    profile:        p.profile,
    is_responsible: p.isResponsible ?? false,
    observations:   p.observations ?? null,
  }));

  const { error } = await supabase.from('participants').insert(rows);
  if (error) {
    console.warn('[reservationRepo] insertParticipants erro:', error.message);
    return { ok: false, error: error.message };
  }
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
    reservation_id: reservationId,
    method:         method ?? null,
    amount:         amountPaid,
    status:         status,
    notes:          notes ?? null,
    paid_at:        status === 'paid' ? new Date().toISOString() : null,
  });

  if (error) {
    console.warn('[reservationRepo] insertPaymentRecord erro:', error.message);
    return { ok: false, error: error.message };
  }
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
