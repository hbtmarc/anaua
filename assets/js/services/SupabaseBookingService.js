/**
 * @fileoverview SupabaseBookingService — persistência real de reservas.
 *
 * Mantém o projeto estático (HTML/CSS/JS) usando o cliente Supabase via CDN.
 * Não usa service_role, chave secreta, npm, framework ou backend próprio.
 */

import { supabase } from '../supabaseClient.js';
import { EXPERIENCES } from '../data.js';
import { ensurePendingSignupForBooking, setSession, saveProfile } from './UserService.js';

const RESERVATION_CODE_PREFIX = 'ANA';

function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

function mapReservationPaymentMethod(method) {
  if (method === 'credit_card') return 'card';
  if (method === 'signal_balance') return 'signal_balance';
  if (method === 'pix') return 'pix';
  return 'manual';
}

function mapPaymentMethod(method) {
  if (method === 'credit_card') return 'card';
  if (method === 'pix') return 'pix';
  if (method === 'signal_balance') return 'pix';
  return 'manual';
}

function makeReservationCode(localId) {
  const clean = String(localId ?? crypto.randomUUID()).replace(/[^a-z0-9]/gi, '').toUpperCase();
  return `${RESERVATION_CODE_PREFIX}-${clean.slice(-10)}`;
}

function getLocalExperience(booking) {
  return EXPERIENCES.find(exp => exp.id === booking.experienceId) ?? null;
}

function getLocalExit(booking, localExperience) {
  return localExperience?.nextExits?.find(exit => exit.id === booking.exitId) ?? null;
}

function getParticipantCount(booking) {
  return Number(booking.participants?.length || booking.profileQtys?.reduce((total, item) => total + Number(item.qty || 0), 0) || 1);
}

async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.warn('[supabaseBooking] Não foi possível ler usuário autenticado:', error.message);
    return null;
  }
  return data?.user ?? null;
}

async function resolveExperience(localExperience) {
  if (!localExperience) {
    return { data: null, error: new Error('Experiência local não encontrada no catálogo.') };
  }

  let query = supabase
    .from('experiences')
    .select('id, title, slug, base_price')
    .eq('slug', localExperience.slug)
    .limit(1);

  let { data, error } = await query;
  if (error) return { data: null, error };
  if (data?.[0]) return { data: data[0], error: null };

  ({ data, error } = await supabase
    .from('experiences')
    .select('id, title, slug, base_price')
    .eq('title', localExperience.title)
    .limit(1));

  if (error) return { data: null, error };
  return { data: data?.[0] ?? null, error: null };
}

async function resolveDeparture(booking, supabaseExperienceId, localExit) {
  const { data, error } = await supabase
    .from('departures')
    .select('id, title, start_at, price, capacity, status')
    .eq('experience_id', supabaseExperienceId)
    .eq('status', 'scheduled')
    .order('start_at', { ascending: true });

  if (error) return { data: null, error };

  const rows = Array.isArray(data) ? data : [];
  const byLocalId = rows.find(row => row.title === booking.exitId);
  if (byLocalId) return { data: byLocalId, error: null };

  const byDate = localExit?.date
    ? rows.find(row => String(row.start_at ?? '').startsWith(localExit.date))
    : null;
  if (byDate) return { data: byDate, error: null };

  return { data: rows[0] ?? null, error: null };
}

async function ensureUserForBooking(booking) {
  const currentUser = await getCurrentUser();
  if (currentUser) {
    console.log('[supabaseBooking] Usuário autenticado detectado ✓');
    return currentUser;
  }

  const signup = await ensurePendingSignupForBooking(booking.payer);
  if (signup?.ok && signup.user) {
    console.log('[supabaseBooking] Conta Supabase criada/vinculada para reserva ✓');
    setSession({ email: signup.user.email, name: booking.payer.fullName });
    saveProfile(booking.payer);
    return signup.user;
  }

  if (signup?.code === 'EMAIL_ALREADY_REGISTERED') {
    const err = new Error('Este e-mail já possui cadastro. Faça login para concluir sua reserva.');
    err.code = 'EMAIL_ALREADY_REGISTERED';
    throw err;
  }

  return null;
}

export async function createSupabaseBooking(booking, split) {
  const localExperience = getLocalExperience(booking);
  const localExit = getLocalExit(booking, localExperience);
  const user = await ensureUserForBooking(booking);

  const expResult = await resolveExperience(localExperience);
  if (expResult.error) throw expResult.error;
  if (!expResult.data) {
    throw new Error(`A experiência "${localExperience?.title ?? booking.experienceId}" ainda não está cadastrada no Supabase. Rode o seed do catálogo antes de testar reservas reais.`);
  }

  const depResult = await resolveDeparture(booking, expResult.data.id, localExit);
  if (depResult.error) throw depResult.error;
  if (!depResult.data) {
    throw new Error(`A saída "${booking.exitId}" ainda não está cadastrada no Supabase. Rode o seed do catálogo antes de testar reservas reais.`);
  }

  const reservationCode = booking.voucherCode || makeReservationCode(booking.id);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
  const participantCount = getParticipantCount(booking);
  const notesPayload = {
    local_booking_id: booking.id,
    local_experience_id: booking.experienceId,
    local_exit_id: booking.exitId,
    local_meeting_point_id: booking.meetingPointId,
    emergency_contact: booking.emergencyContact ?? null,
    observations: booking.observations ?? '',
    terms: booking.termsAcceptance ?? null,
  };

  const reservationPayload = {
    departure_id: depResult.data.id,
    user_id: user?.id ?? null,
    reservation_code: reservationCode,
    expires_at: expiresAt,
    payment_method: mapReservationPaymentMethod(booking.paymentMethod),
    customer_name: booking.payer.fullName,
    customer_email: normalizeEmail(booking.payer.email),
    customer_phone: booking.payer.phone,
    participants_count: participantCount,
    total_amount: Number(booking.totalAmount || 0),
    amount_paid: 0,
    payment_status: 'pending',
    reservation_status: 'requested',
    terms_accepted: Boolean(booking.termsAcceptance?.terms && booking.termsAcceptance?.cancellation && booking.termsAcceptance?.riskAwareness),
    notes: JSON.stringify(notesPayload),
  };

  const { data: reservation, error: reservationError } = await supabase
    .from('reservations')
    .insert(reservationPayload)
    .select('*')
    .single();

  if (reservationError) throw reservationError;
  console.log('[supabaseBooking] Reserva gravada no Supabase ✓', reservation.reservation_code);

  const participantRows = (booking.participants ?? []).map((participant, index) => ({
    reservation_id: reservation.id,
    full_name: participant.fullName,
    document: participant.docNumber || null,
    birth_date: participant.birthdate || null,
    phone: index === 0 ? booking.payer.phone : null,
    is_payer: Boolean(index === 0 && booking.payer.isAlsoParticipant),
  }));

  if (participantRows.length) {
    const { error: participantsError } = await supabase.from('participants').insert(participantRows);
    if (participantsError) throw participantsError;
    console.log('[supabaseBooking] Participantes gravados no Supabase ✓', participantRows.length);
  }

  let payment = null;
  let paymentError = null;
  const paymentAmount = Number(split?.signalAmount || booking.totalAmount || 0);
  if (paymentAmount > 0) {
    const { data, error } = await supabase
      .from('payments')
      .insert({
        reservation_id: reservation.id,
        method: mapPaymentMethod(booking.paymentMethod),
        amount: paymentAmount,
        status: 'pending',
        external_id: null,
        paid_at: null,
      })
      .select('*')
      .single();

    payment = data ?? null;
    paymentError = error ?? null;
    if (paymentError) {
      console.warn('[supabaseBooking] Pagamento não foi gravado. Verifique policy INSERT em payments:', paymentError.message);
    } else {
      console.log('[supabaseBooking] Pagamento pendente gravado no Supabase ✓');
    }
  }

  return {
    reservation,
    participants: participantRows,
    payment,
    paymentError,
    departure: depResult.data,
    experience: expResult.data,
  };
}

export async function listCurrentUserReservations() {
  const user = await getCurrentUser();
  if (!user) return { ok: false, data: [], error: new Error('Usuário não autenticado.') };

  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return { ok: false, data: [], error };
  return { ok: true, data: data ?? [], error: null, user };
}
