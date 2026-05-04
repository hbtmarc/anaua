/**
 * @fileoverview ReservationStore — persiste bookings em localStorage.
 * Expõe CRUD simples + query helpers.
 */

import { STATUS_TRANSITIONS } from '../types/booking.types.js';

const STORE_KEY = 'anaua_bookings';
const DRAFT_KEY = 'anaua_booking_draft';

// ─── Persistence helpers ──────────────────────────────────────────────────────

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function writeAll(bookings) {
  localStorage.setItem(STORE_KEY, JSON.stringify(bookings));
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Save a new booking (id must already be set).
 * @param {import('../types/booking.types.js').Booking} booking
 * @returns {import('../types/booking.types.js').Booking}
 */
export function saveBooking(booking) {
  const all = readAll();
  const idx = all.findIndex(b => b.id === booking.id);
  const now = new Date().toISOString();

  const updated = { ...booking, updatedAt: now };

  if (idx >= 0) {
    all[idx] = updated;
  } else {
    all.push({ ...updated, createdAt: now });
  }

  writeAll(all);
  return updated;
}

/**
 * Get a booking by id.
 * @param {string} id
 * @returns {import('../types/booking.types.js').Booking|undefined}
 */
export function getBooking(id) {
  return readAll().find(b => b.id === id);
}

/**
 * List all bookings (optionally filtered by experienceId).
 * @param {string} [experienceId]
 * @returns {import('../types/booking.types.js').Booking[]}
 */
export function listBookings(experienceId) {
  const all = readAll();
  return experienceId ? all.filter(b => b.experienceId === experienceId) : all;
}

/**
 * Transition a booking to a new status.
 * Throws if transition is not allowed.
 * @param {string} id
 * @param {import('../types/booking.types.js').BookingStatus} newStatus
 * @returns {import('../types/booking.types.js').Booking}
 */
export function transitionStatus(id, newStatus) {
  const booking = getBooking(id);
  if (!booking) throw new Error(`Booking ${id} not found`);

  const allowed = STATUS_TRANSITIONS[booking.status] ?? [];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Transition ${booking.status} → ${newStatus} is not allowed`);
  }

  return saveBooking({ ...booking, status: newStatus });
}

/**
 * Append a payment result to the history.
 * @param {string} id
 * @param {import('../types/booking.types.js').PaymentResult} result
 * @param {number} amountApplied
 * @returns {import('../types/booking.types.js').Booking}
 */
export function recordPayment(id, result, amountApplied) {
  const booking = getBooking(id);
  if (!booking) throw new Error(`Booking ${id} not found`);

  const newPaid    = (booking.paidAmount ?? 0) + (result.success ? amountApplied : 0);
  const newPending = Math.max(0, booking.totalAmount - newPaid);

  return saveBooking({
    ...booking,
    paidAmount:     newPaid,
    pendingAmount:  newPending,
    paymentHistory: [...(booking.paymentHistory ?? []), result],
  });
}

// ─── Draft (wizard in-progress state) ─────────────────────────────────────────

/**
 * @param {Partial<import('../types/booking.types.js').Booking>} draft
 */
export function saveDraft(draft) {
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

/**
 * @returns {Partial<import('../types/booking.types.js').Booking>|null}
 */
export function loadDraft() {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null');
  } catch {
    return null;
  }
}

export function clearDraft() {
  sessionStorage.removeItem(DRAFT_KEY);
}
