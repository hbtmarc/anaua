/**
 * @fileoverview BookingService — orchestrates the complete booking lifecycle.
 *
 * Responsibilities:
 *  - Validate each step's data before progressing.
 *  - Compute pricing (total, signal, balance).
 *  - Delegate payment to the injected provider.
 *  - Delegate persistence to ReservationStore.
 *  - Generate voucher codes.
 */

import { TERMS_VERSION, STATUS_TRANSITIONS, PROFILES } from '../types/booking.types.js';
import {
  saveBooking, getBooking, transitionStatus, recordPayment,
  saveDraft, loadDraft, clearDraft,
} from './ReservationStore.js';
import { DEFAULT_PROVIDER } from './PaymentService.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return `RES-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
}

function voucherCode(id) {
  // Format: ANÁ + last 8 chars of id, uppercased
  return 'ANÁ' + id.replace(/[^A-Z0-9]/gi, '').slice(-8).toUpperCase();
}

// ─── Validation helpers ────────────────────────────────────────────────────────

const CPF_RE = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/;
const PHONE_RE = /^\(\d{2}\)\s\d{4,5}-\d{4}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE  = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Returns an array of error strings (empty = valid).
 * @param {any} value
 * @param {Array<(v:any)=>string|null>} rules
 * @returns {string[]}
 */
export function validateRules(value, rules) {
  return rules.map(r => r(value)).filter(Boolean);
}

export const RULES = {
  required:  v => (!v || String(v).trim() === '') ? 'Campo obrigatório.' : null,
  cpf:       v => !CPF_RE.test(v ?? '')   ? 'CPF inválido (000.000.000-00).' : null,
  phone:     v => !PHONE_RE.test(v ?? '') ? 'Telefone inválido ((00) 00000-0000).' : null,
  email:     v => !EMAIL_RE.test(v ?? '') ? 'E-mail inválido.' : null,
  date:      v => !DATE_RE.test(v ?? '')  ? 'Data inválida (AAAA-MM-DD).' : null,
  minAge: min => v => {
    if (!DATE_RE.test(v ?? '')) return null;
    const age = ~~((Date.now() - new Date(v).getTime()) / 31_557_600_000);
    return age < min ? `Idade mínima: ${min} anos.` : null;
  },
  maxAge: max => v => {
    if (!DATE_RE.test(v ?? '')) return null;
    const age = ~~((Date.now() - new Date(v).getTime()) / 31_557_600_000);
    return age > max ? `Idade máxima: ${max} anos.` : null;
  },
};

// ─── Step validators ──────────────────────────────────────────────────────────

/**
 * Validate step 1 — exit + meeting point selection.
 * @param {{ exitId:string, meetingPointId:string }} data
 * @returns {Record<string,string>} field → error
 */
export function validateStep1(data) {
  const errors = {};
  if (!data.exitId)         errors.exitId         = 'Selecione uma saída.';
  if (!data.meetingPointId) errors.meetingPointId = 'Selecione um ponto de encontro.';
  return errors;
}

/**
 * Validate step 2 — profile quantities.
 * @param {{ profileQtys: import('../types/booking.types.js').ProfileQty[], minAge:number }} data
 * @returns {Record<string,string>}
 */
export function validateStep2(data) {
  const errors = {};
  const total = (data.profileQtys ?? []).reduce((s, p) => s + p.qty, 0);
  if (total < 1) errors.qty = 'Selecione pelo menos 1 participante.';

  // If experience has minAge ≥ 18, no children allowed
  const hasChildren = (data.profileQtys ?? []).some(p => p.profile === 'child' && p.qty > 0);
  if (hasChildren && data.minAge > 0 && data.minAge >= 18) {
    errors.child = `Esta experiência não permite crianças (idade mínima: ${data.minAge} anos).`;
  }
  return errors;
}

/**
 * Validate step 3 — payer.
 * @param {import('../types/booking.types.js').Payer} payer
 * @returns {Record<string,string>}
 */
export function validateStep3(payer) {
  const errors = {};
  const check = (field, rules) => {
    const errs = validateRules(payer?.[field], rules);
    if (errs.length) errors[field] = errs[0];
  };
  check('fullName', [RULES.required]);
  check('cpf',      [RULES.required, RULES.cpf]);
  check('email',    [RULES.required, RULES.email]);
  check('phone',    [RULES.required, RULES.phone]);
  check('birthdate',[RULES.required, RULES.date, RULES.minAge(18)]);
  return errors;
}

/**
 * Validate step 4 — participants list.
 * @param {import('../types/booking.types.js').Participant[]} participants
 * @param {import('../types/booking.types.js').ProfileQty[]} profileQtys
 * @returns {Record<string,string>}
 */
export function validateStep4(participants, profileQtys) {
  const errors = {};
  const expectedTotal = profileQtys.reduce((s, p) => s + p.qty, 0);

  if (!participants || participants.length !== expectedTotal) {
    errors._count = `Preencha os dados de todos os ${expectedTotal} participante(s).`;
    return errors;
  }

  participants.forEach((p, i) => {
    if (!p.fullName?.trim()) errors[`p${i}_fullName`]  = 'Nome obrigatório.';
    if (!p.docNumber?.trim()) errors[`p${i}_docNumber`] = 'Documento obrigatório.';
    if (!DATE_RE.test(p.birthdate ?? '')) errors[`p${i}_birthdate`] = 'Data inválida.';

    const profile = PROFILES[p.profile];
    if (profile?.minAge && DATE_RE.test(p.birthdate ?? '')) {
      const age = ~~((Date.now() - new Date(p.birthdate).getTime()) / 31_557_600_000);
      if (age < profile.minAge) errors[`p${i}_birthdate`] = `Perfil ${profile.label}: mínimo ${profile.minAge} anos.`;
    }
  });

  return errors;
}

/**
 * Validate step 5 — emergency contact.
 * @param {import('../types/booking.types.js').EmergencyContact} ec
 * @returns {Record<string,string>}
 */
export function validateStep5(ec) {
  const errors = {};
  if (!ec?.fullName?.trim())    errors.fullName     = 'Nome obrigatório.';
  if (!ec?.phone?.trim())       errors.phone        = 'Telefone obrigatório.';
  if (!ec?.relationship?.trim())errors.relationship = 'Informe o parentesco.';
  return errors;
}

/**
 * Validate step 6 — terms acceptance.
 * @param {import('../types/booking.types.js').TermsAcceptance} terms
 * @returns {Record<string,string>}
 */
export function validateStep6(terms) {
  const errors = {};
  if (!terms?.terms)          errors.terms          = 'Aceite os Termos de Uso.';
  if (!terms?.cancellation)   errors.cancellation   = 'Aceite a Política de Cancelamento.';
  if (!terms?.riskAwareness)  errors.riskAwareness  = 'Confirme a ciência de riscos.';
  if (!terms?.imageConsent !== false && terms?.imageConsent === undefined) {
    // imageConsent is optional (user may decline) — no validation needed
  }
  return errors;
}

/**
 * Validate step 7 — payment method selection.
 * @param {{ paymentMethod: import('../types/booking.types.js').PaymentMethod, signalPct?: number }} data
 * @returns {Record<string,string>}
 */
export function validateStep7(data) {
  const errors = {};
  const valid = ['pix', 'credit_card', 'signal_balance'];
  if (!valid.includes(data?.paymentMethod)) errors.paymentMethod = 'Selecione uma forma de pagamento.';
  if (data?.paymentMethod === 'signal_balance') {
    if (!data.signalPct || data.signalPct < 30) errors.signalPct = 'Sinal mínimo de 30%.';
    if (data.signalPct > 70) errors.signalPct = 'Sinal máximo de 70%.';
  }
  return errors;
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

/**
 * Compute total based on profile quantities and unit prices.
 * @param {import('../types/booking.types.js').ProfileQty[]} profileQtys
 * @returns {number}
 */
export function computeTotal(profileQtys) {
  return profileQtys.reduce((sum, p) => sum + p.qty * p.unitPrice, 0);
}

/**
 * Compute signal and balance amounts.
 * @param {number} total
 * @param {import('../types/booking.types.js').PaymentMethod} method
 * @param {number} [signalPct] — only for signal_balance
 * @returns {{ signalAmount: number, balanceAmount: number, balanceDueDate: number }}
 */
export function computeSplit(total, method, signalPct = 50) {
  if (method === 'signal_balance') {
    const signal  = Math.round(total * (signalPct / 100));
    const balance = total - signal;
    const dueDate = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days from now
    return { signalAmount: signal, balanceAmount: balance, balanceDueDate: dueDate };
  }
  return { signalAmount: total, balanceAmount: 0, balanceDueDate: 0 };
}

// ─── Main service ──────────────────────────────────────────────────────────────

/**
 * Create a fresh booking draft from wizard step data.
 * @param {string} experienceId
 * @returns {Partial<import('../types/booking.types.js').Booking>}
 */
export function createDraft(experienceId) {
  const draft = {
    id:              uid(),
    experienceId,
    exitId:          null,
    meetingPointId:  null,
    profileQtys:     [],
    payer:           null,
    participants:    [],
    emergencyContact:null,
    observations:    '',
    termsAcceptance: null,
    paymentMethod:   null,
    totalAmount:     0,
    paidAmount:      0,
    pendingAmount:   0,
    paymentHistory:  [],
    status:          'draft',
    createdAt:       new Date().toISOString(),
    updatedAt:       new Date().toISOString(),
    voucherCode:     '',
  };
  saveDraft(draft);
  return draft;
}

export { loadDraft, saveDraft, clearDraft };

/**
 * Submit and pay. Returns updated booking with payment info.
 *
 * @param {import('../types/booking.types.js').Booking} booking
 * @param {{ signalPct?: number, cardData?: object }} paymentOptions
 * @param {import('../services/PaymentService.js').MockPaymentProvider} [provider]
 * @returns {Promise<{ booking: import('../types/booking.types.js').Booking, paymentResult: import('../types/booking.types.js').PaymentResult }>}
 */
export async function submitBooking(booking, paymentOptions = {}, provider = DEFAULT_PROVIDER) {
  // Persists as pending_payment before charging
  const split = computeSplit(booking.totalAmount, booking.paymentMethod, paymentOptions.signalPct);

  const booked = saveBooking({
    ...booking,
    voucherCode:  voucherCode(booking.id),
    paidAmount:   0,
    pendingAmount:booking.totalAmount,
    status:       'pending_payment',
  });

  /** @type {import('../services/PaymentService.js').PaymentRequest} */
  const req = {
    bookingId:    booked.id,
    method:       booked.paymentMethod,
    amount:       split.signalAmount,  // charge signal amount (or full if pix/card)
    payerName:    booked.payer.fullName,
    payerCpf:     booked.payer.cpf,
    payerEmail:   booked.payer.email,
    cardToken:    paymentOptions.cardToken ?? null,
    installments: paymentOptions.installments ?? null,
  };

  const result = await provider.process(req);
  const updated = recordPayment(booked.id, result, result.success ? split.signalAmount : 0);

  if (result.success) {
    const newStatus = split.balanceAmount > 0 ? 'reserved' : 'confirmed';
    const final = transitionStatus(updated.id, newStatus);
    clearDraft();
    return { booking: final, paymentResult: result, split };
  } else {
    // keep pending_payment so user can retry
    return { booking: updated, paymentResult: result, split };
  }
}

/**
 * Re-export store helpers so consumers only need to import BookingService.
 */
export { getBooking, listBookings } from './ReservationStore.js';
