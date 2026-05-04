/**
 * @fileoverview PaymentService — abstract provider interface + MockPaymentProvider.
 *
 * To integrate a real gateway, implement the same interface and swap the
 * DEFAULT_PROVIDER export at the bottom of this file.
 */

// ─── Provider Interface ────────────────────────────────────────────────────────

/**
 * @typedef {Object} PaymentRequest
 * @property {string} bookingId
 * @property {import('../types/booking.types.js').PaymentMethod} method
 * @property {number} amount             — em centavos para evitar float
 * @property {string} payerName
 * @property {string} payerCpf
 * @property {string} payerEmail
 * @property {string|null} cardToken     — opaque token (real gateway integração)
 * @property {string|null} installments  — '1x', '3x', etc.
 */

/**
 * Abstract interface every provider must implement.
 * @interface
 */
class PaymentProvider {
  /**
   * @param {PaymentRequest} _req
   * @returns {Promise<import('../types/booking.types.js').PaymentResult>}
   */
  // eslint-disable-next-line no-unused-vars
  async process(_req) { throw new Error('Not implemented'); }

  /**
   * @param {string} _transactionId
   * @returns {Promise<import('../types/booking.types.js').PaymentResult>}
   */
  // eslint-disable-next-line no-unused-vars
  async refund(_transactionId) { throw new Error('Not implemented'); }
}

// ─── Mock Provider ─────────────────────────────────────────────────────────────

/** Simulates network delay. */
function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/** Generates a fake PIX copia-e-cola string. */
function fakePix(bookingId, amount) {
  return `00020126580014BR.GOV.BCB.PIX0136anaua-eco@pix.com.br5204000053039865802BR5913Anaua Ecotur6009SAO PAULO62070503***6304${bookingId.slice(-4).toUpperCase()}AMT${amount}`;
}

export class MockPaymentProvider extends PaymentProvider {

  /**
   * Processes a mock payment.
   * - PIX: always succeeds after 1.5s, returns pixCode.
   * - credit_card: fails 10% of the time (simulates decline).
   * - signal_balance: always succeeds (signal portion only).
   *
   * @param {PaymentRequest} req
   * @returns {Promise<import('../types/booking.types.js').PaymentResult>}
   */
  async process(req) {
    await delay(1400);

    const now = new Date().toISOString();
    const txId = `MOCK-${Date.now().toString(36).toUpperCase()}-${req.bookingId.slice(-4).toUpperCase()}`;

    // Simulate ~10% card decline
    if (req.method === 'credit_card' && Math.random() < 0.1) {
      return {
        success:       false,
        transactionId: txId,
        method:        req.method,
        amountPaid:    0,
        paidAt:        now,
        pixCode:       null,
        pixQrData:     null,
        errorCode:     'CARD_DECLINED',
        errorMsg:      'Cartão recusado. Tente outro cartão ou outra forma de pagamento.',
      };
    }

    const isPix = req.method === 'pix';

    return {
      success:       true,
      transactionId: txId,
      method:        req.method,
      amountPaid:    req.amount,
      paidAt:        now,
      pixCode:       isPix ? fakePix(req.bookingId, req.amount) : null,
      pixQrData:     isPix ? _fakeQrSvg(req.bookingId) : null,
      errorCode:     null,
      errorMsg:      null,
    };
  }

  /**
   * @param {string} transactionId
   * @returns {Promise<import('../types/booking.types.js').PaymentResult>}
   */
  async refund(transactionId) {
    await delay(800);
    return {
      success:       true,
      transactionId: `REF-${transactionId}`,
      method:        'refund',
      amountPaid:    0,
      paidAt:        new Date().toISOString(),
      pixCode:       null,
      pixQrData:     null,
      errorCode:     null,
      errorMsg:      null,
    };
  }
}

/**
 * Generates a minimal inline SVG that looks like a QR code placeholder.
 * @param {string} seed
 * @returns {string} data-URI SVG
 */
function _fakeQrSvg(seed) {
  const size = 200;
  const cells = 20;
  const cell  = size / cells;

  // deterministic pseudo-random from seed
  let s = [...seed].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const rng = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };

  let rects = '';
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      if (r < 7 && c < 7) continue; // top-left finder
      if (r < 7 && c > cells - 8) continue; // top-right finder
      if (r > cells - 8 && c < 7) continue; // bottom-left finder
      if (rng() > 0.5) {
        rects += `<rect x="${c * cell}" y="${r * cell}" width="${cell}" height="${cell}" fill="#000"/>`;
      }
    }
  }

  // Finder patterns
  const fp = (x, y) => `<rect x="${x}" y="${y}" width="${7 * cell}" height="${7 * cell}" fill="none" stroke="#000" stroke-width="${cell}"/><rect x="${x + cell}" y="${y + cell}" width="${5 * cell}" height="${5 * cell}" fill="#000"/><rect x="${x + 2 * cell}" y="${y + 2 * cell}" width="${3 * cell}" height="${3 * cell}" fill="#fff"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="#fff"/>${rects}${fp(0,0)}${fp((cells-7)*cell,0)}${fp(0,(cells-7)*cell)}</svg>`;

  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

// ─── Default export ────────────────────────────────────────────────────────────

/** Swap this to a real provider (Stripe, Pagar.me, etc.) without changing consumers. */
export const DEFAULT_PROVIDER = new MockPaymentProvider();
