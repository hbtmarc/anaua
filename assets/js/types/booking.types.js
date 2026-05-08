/**
 * @fileoverview Domain types for the Anauá booking system.
 * All types are JSDoc-only (no runtime overhead).
 */

// ─── Status ───────────────────────────────────────────────────────────────────

/**
 * Lifecycle states of a booking.
 * @typedef {'draft'|'pending_payment'|'reserved'|'confirmed'|'cancelled'|'no_show'|'completed'} BookingStatus
 */

/**
 * Valid status transitions map.
 * @type {Record<BookingStatus, BookingStatus[]>}
 */
export const STATUS_TRANSITIONS = {
  draft:           ['pending_payment', 'cancelled'],
  pending_payment: ['reserved', 'cancelled'],
  reserved:        ['confirmed', 'cancelled'],
  confirmed:       ['no_show', 'completed', 'cancelled'],
  cancelled:       [],
  no_show:         [],
  completed:       [],
};

/** Human-readable labels for each status. */
export const STATUS_LABEL = {
  draft:           'Rascunho',
  pending:         'Pendente',
  pending_payment: 'Aguardando pagamento',
  reserved:        'Reservado',
  confirmed:       'Confirmado',
  cancelled:       'Cancelado',
  refunded:        'Reembolsado',
  no_show:         'Não compareceu',
  completed:       'Concluído',
  // payment statuses
  paid:            'Pago',
  partial:         'Parcial',
};

/** Badge CSS class suffix per status. */
export const STATUS_CLASS = {
  draft:           'badge--draft',
  pending:         'badge--pending',
  pending_payment: 'badge--pending',
  reserved:        'badge--reserved',
  confirmed:       'badge--confirmed',
  cancelled:       'badge--cancelled',
  refunded:        'badge--cancelled',
  no_show:         'badge--noshow',
  completed:       'badge--completed',
  // payment statuses
  paid:            'badge--confirmed',
  partial:         'badge--reserved',
};

// ─── Participant profiles ──────────────────────────────────────────────────────

/**
 * @typedef {'adult'|'child'|'senior'|'pcd'} ProfileType
 */

/** @type {Record<ProfileType, {label:string, minAge:number|null, maxAge:number|null}>} */
export const PROFILES = {
  adult:  { label: 'Adulto',  minAge: 18,  maxAge: null },
  child:  { label: 'Criança', minAge: 0,   maxAge: 17   },
  senior: { label: 'Idoso',   minAge: 60,  maxAge: null },
  pcd:    { label: 'PCD',     minAge: null, maxAge: null },
};

// ─── Payment ──────────────────────────────────────────────────────────────────

/** @typedef {'pix'|'credit_card'|'signal_balance'} PaymentMethod */

/** @type {Record<PaymentMethod, string>} */
export const PAYMENT_LABEL = {
  pix:             'PIX',
  credit_card:     'Cartão de crédito',
  signal_balance:  'Sinal + Saldo',
};

/**
 * @typedef {Object} PaymentSplit
 * @property {PaymentMethod} method
 * @property {number} signalAmount      — valor da entrada (sinal)
 * @property {number} balanceAmount     — saldo restante a pagar
 * @property {number} balanceDueDate    — épica (ms) em que o saldo vence
 * @property {string|null} installments — ex: '3x' (cartão)
 */

/**
 * Resultado retornado pelo PaymentProvider.process().
 * @typedef {Object} PaymentResult
 * @property {boolean} success
 * @property {string}  transactionId
 * @property {string}  method
 * @property {number}  amountPaid
 * @property {string}  paidAt          — ISO timestamp
 * @property {string|null} pixCode     — copia-e-cola
 * @property {string|null} pixQrData   — base64 QR code data (mock)
 * @property {string|null} errorCode
 * @property {string|null} errorMsg
 */

// ─── Booking entity ───────────────────────────────────────────────────────────

/**
 * @typedef {Object} Payer
 * @property {string} fullName
 * @property {string} cpf
 * @property {string} email
 * @property {string} phone
 * @property {string} birthdate  — YYYY-MM-DD
 * @property {boolean} isAlsoParticipant
 */

/**
 * @typedef {Object} Participant
 * @property {string}      id
 * @property {string}      fullName
 * @property {string}      docNumber       — CPF, RG ou passaporte
 * @property {string}      birthdate       — YYYY-MM-DD
 * @property {ProfileType} profile
 * @property {boolean}     isResponsible   — true for the payer when isAlsoParticipant
 * @property {string|null} observations
 */

/**
 * @typedef {Object} EmergencyContact
 * @property {string} fullName
 * @property {string} phone
 * @property {string} relationship
 */

/**
 * @typedef {Object} TermsAcceptance
 * @property {boolean} terms            — termos de uso
 * @property {boolean} cancellation     — política de cancelamento
 * @property {boolean} riskAwareness    — ciência de riscos
 * @property {boolean} imageConsent     — uso de imagem
 * @property {string}  acceptedAt       — ISO timestamp
 * @property {string}  version          — e.g. "2026-01"
 */

/** Current terms version — bump when policies change. */
export const TERMS_VERSION = '2026-01';

/**
 * @typedef {Object} ProfileQty
 * @property {ProfileType} profile
 * @property {number}      qty
 * @property {number}      unitPrice
 */

/**
 * Full booking entity.
 * @typedef {Object} Booking
 * @property {string}          id
 * @property {string}          experienceId
 * @property {string}          exitId
 * @property {string}          meetingPointId
 * @property {ProfileQty[]}    profileQtys
 * @property {Payer}           payer
 * @property {Participant[]}   participants
 * @property {EmergencyContact} emergencyContact
 * @property {string}          observations
 * @property {TermsAcceptance} termsAcceptance
 * @property {PaymentMethod}   paymentMethod
 * @property {number}          totalAmount
 * @property {number}          paidAmount
 * @property {number}          pendingAmount
 * @property {PaymentResult[]} paymentHistory
 * @property {BookingStatus}   status
 * @property {string}          createdAt
 * @property {string}          updatedAt
 * @property {string}          voucherCode
 */
