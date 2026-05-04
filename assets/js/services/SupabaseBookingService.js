import { supabase } from '../supabaseClient.js';

function normalizeEmail(email) { return String(email || '').trim().toLowerCase(); }

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  if (data?.user) console.log('Supabase user detected');
  return data?.user ?? null;
}

export async function getCurrentProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (!error && data) console.log('Profile loaded');
  return data ?? null;
}

export async function signInCustomer(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: normalizeEmail(email), password });
  if (error) return { ok: false, error: error.message };
  return { ok: true, user: data.user };
}

export async function signUpCustomer(profile, password) {
  const email = normalizeEmail(profile?.email);
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: profile?.fullName || '' } } });
  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
      return { ok: false, code: 'EMAIL_ALREADY_EXISTS' };
    }
    return { ok: false, code: 'SIGNUP_ERROR', error: error.message };
  }
  return { ok: true, user: data.user };
}

export async function createReservationFromDraft(draft, exp) {
  const user = await getCurrentUser();
  const participants = Array.isArray(draft?.participants) ? draft.participants : [];
  const paymentMethod = draft?.paymentMethod || null;
  const total = Number(draft?.totalAmount || 0);
  const amountPaid = paymentMethod === 'signal_balance' ? Math.round(total * 0.5) : paymentMethod ? total : 0;
  const paymentStatus = amountPaid <= 0 ? 'pending' : (amountPaid < total ? 'partial' : 'paid');

  const reservationPayload = {
    departure_id: draft?.exitId || null,
    user_id: user?.id || null,
    customer_name: draft?.payer?.fullName || '',
    customer_email: normalizeEmail(draft?.payer?.email),
    customer_phone: draft?.payer?.phone || '',
    participants_count: participants.length,
    total_amount: total,
    amount_paid: amountPaid,
    payment_status: paymentStatus,
    reservation_status: 'requested',
    terms_accepted: Boolean(draft?.termsAcceptance?.terms && draft?.termsAcceptance?.cancellation && draft?.termsAcceptance?.riskAwareness),
    notes: draft?.observations || null,
    reservation_code: draft?.voucherCode || `ANA-${Date.now().toString(36).toUpperCase()}`,
    expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    payment_method: paymentMethod,
  };

  const { data: reservation, error } = await supabase.from('reservations').insert(reservationPayload).select('*').single();
  if (error) throw error;
  console.log('Reservation inserted');

  if (participants.length) {
    const rows = participants.map((p) => ({ reservation_id: reservation.id, full_name: p.fullName, document: p.docNumber || null, birth_date: p.birthdate || null }));
    const { error: pErr } = await supabase.from('participants').insert(rows);
    if (pErr) throw pErr;
    console.log('Participants inserted');
  }

  if (paymentMethod) {
    await supabase.from('payments').insert({ reservation_id: reservation.id, method: paymentMethod, amount: amountPaid || total, status: 'pending' });
    console.log('Payment inserted');
  }

  return reservation;
}

export async function getMyReservations() {
  const user = await getCurrentUser();
  if (!user) return { ok: false, data: [], error: 'NO_USER' };
  const { data, error } = await supabase.from('reservations').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
  if (error) return { ok: false, data: [], error: error.message };
  console.log('Customer reservations loaded');
  return { ok: true, data: data || [] };
}

async function safeCount(table, filter) {
  let q = supabase.from(table).select('*', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count, error } = await q;
  if (error) return null;
  return count || 0;
}

export async function getAdminDashboardCounts() {
  const counts = {
    activeExperiences: await safeCount('experiences', q => q.eq('active', true)),
    scheduledDepartures: await safeCount('departures', q => q.eq('status', 'scheduled')),
    reservations: await safeCount('reservations'),
    pendingPayments: await safeCount('payments', q => q.eq('status', 'pending')),
    participants: await safeCount('participants'),
  };
  console.log('Admin dashboard loaded');
  return counts;
}

export async function getAdminReservations() {
  const { data, error } = await supabase.from('reservations').select('*').order('created_at', { ascending: false });
  if (error) return { ok: false, data: [], error: error.message };
  return { ok: true, data: data || [] };
}
