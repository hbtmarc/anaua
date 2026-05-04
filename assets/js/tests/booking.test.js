/**
 * @fileoverview booking.test.js — Unit tests for booking business rules.
 *
 * Zero dependencies. Runs in:
 *  - Browser: open tests/index.html
 *  - Node ≥ 18: node assets/js/tests/booking.test.js
 */

// ─── Minimal test runner ──────────────────────────────────────────────────────

let _passed = 0;
let _failed = 0;
const _results = [];

function describe(label, fn) {
  _results.push({ type: 'suite', label });
  fn();
}

function it(label, fn) {
  try {
    fn();
    _passed++;
    _results.push({ type: 'pass', label });
  } catch (err) {
    _failed++;
    _results.push({ type: 'fail', label, error: err.message });
  }
}

function expect(actual) {
  return {
    toBe:          expected  => { if (actual !== expected)    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); },
    toEqual:       expected  => { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); },
    toBeTruthy:    ()        => { if (!actual) throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`); },
    toBeFalsy:     ()        => { if (actual)  throw new Error(`Expected falsy, got ${JSON.stringify(actual)}`); },
    toBeGreaterThan: n       => { if (actual <= n) throw new Error(`Expected > ${n}, got ${actual}`); },
    toHaveLength:  n         => { if ((actual?.length ?? 0) !== n) throw new Error(`Expected length ${n}, got ${actual?.length}`); },
    toContain:     key       => { if (!(key in (actual ?? {}))) throw new Error(`Expected object to contain key "${key}"`); },
    toBeEmpty:     ()        => { if (Object.keys(actual ?? {}).length !== 0) throw new Error(`Expected empty object, got ${JSON.stringify(actual)}`); },
  };
}

// ─── Import under test ────────────────────────────────────────────────────────

// Node-compatible dynamic import via a relative path trick
const isNode = typeof process !== 'undefined' && process.versions?.node;

let validateStep1, validateStep2, validateStep3, validateStep4, validateStep5,
    validateStep6, validateStep7, computeTotal, computeSplit, validateRules, RULES;
let STATUS_TRANSITIONS;
let saveBooking, getBooking, transitionStatus, recordPayment;
let MockPaymentProvider;

async function loadModules() {
  const base = isNode ? new URL('../../../', import.meta.url).href : '../../';

  const bs  = await import(`${base}assets/js/services/BookingService.js`);
  const rs  = await import(`${base}assets/js/services/ReservationStore.js`);
  const ps  = await import(`${base}assets/js/services/PaymentService.js`);
  const bt  = await import(`${base}assets/js/types/booking.types.js`);

  ({ validateStep1, validateStep2, validateStep3, validateStep4, validateStep5,
     validateStep6, validateStep7, computeTotal, computeSplit, validateRules, RULES } = bs);
  ({ saveBooking, getBooking, transitionStatus, recordPayment } = rs);
  ({ MockPaymentProvider } = ps);
  ({ STATUS_TRANSITIONS } = bt);
}

// ─── Test suites ──────────────────────────────────────────────────────────────

function runTests() {

  // ── validateRules ────────────────────────────────────────────────────────────
  describe('validateRules', () => {
    it('returns empty array when all rules pass', () => {
      const errs = validateRules('hello@test.com', [RULES.required, RULES.email]);
      expect(errs).toHaveLength(0);
    });

    it('returns error for empty required field', () => {
      const errs = validateRules('', [RULES.required]);
      expect(errs).toHaveLength(1);
    });

    it('required fails for whitespace-only', () => {
      const errs = validateRules('   ', [RULES.required]);
      expect(errs).toHaveLength(1);
    });

    it('email rule rejects invalid format', () => {
      const errs = validateRules('not-an-email', [RULES.email]);
      expect(errs).toHaveLength(1);
    });

    it('cpf rule accepts formatted CPF', () => {
      const errs = validateRules('123.456.789-09', [RULES.cpf]);
      expect(errs).toHaveLength(0);
    });

    it('cpf rule rejects unformatted CPF', () => {
      const errs = validateRules('12345678909', [RULES.cpf]);
      expect(errs).toHaveLength(1);
    });

    it('phone rule accepts formatted phone', () => {
      const errs = validateRules('(11) 99999-9999', [RULES.phone]);
      expect(errs).toHaveLength(0);
    });

    it('minAge rule rejects birthdate making person underage', () => {
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      const errs = validateRules(twoYearsAgo.toISOString().slice(0, 10), [RULES.minAge(18)]);
      expect(errs).toHaveLength(1);
    });

    it('minAge rule accepts birthdate for adult', () => {
      const thirtyYearsAgo = new Date();
      thirtyYearsAgo.setFullYear(thirtyYearsAgo.getFullYear() - 30);
      const errs = validateRules(thirtyYearsAgo.toISOString().slice(0, 10), [RULES.minAge(18)]);
      expect(errs).toHaveLength(0);
    });
  });

  // ── validateStep1 ─────────────────────────────────────────────────────────────
  describe('validateStep1 — exit selection', () => {
    it('passes when exitId and meetingPointId are provided', () => {
      const errs = validateStep1({ exitId: 'e1', meetingPointId: 'mp1' });
      expect(errs).toBeEmpty();
    });

    it('fails when exitId is missing', () => {
      const errs = validateStep1({ exitId: '', meetingPointId: 'mp1' });
      expect(errs).toContain('exitId');
    });

    it('fails when meetingPointId is missing', () => {
      const errs = validateStep1({ exitId: 'e1', meetingPointId: '' });
      expect(errs).toContain('meetingPointId');
    });
  });

  // ── validateStep2 ─────────────────────────────────────────────────────────────
  describe('validateStep2 — profile quantities', () => {
    it('passes with at least 1 participant', () => {
      const errs = validateStep2({ profileQtys: [{ profile: 'adult', qty: 2, unitPrice: 390 }], minAge: 12 });
      expect(errs).toBeEmpty();
    });

    it('fails with 0 total participants', () => {
      const errs = validateStep2({ profileQtys: [{ profile: 'adult', qty: 0, unitPrice: 390 }], minAge: 12 });
      expect(errs).toContain('qty');
    });

    it('fails with children on adults-only experience (minAge ≥ 18)', () => {
      const errs = validateStep2({
        profileQtys: [
          { profile: 'adult', qty: 1, unitPrice: 390 },
          { profile: 'child', qty: 1, unitPrice: 210 },
        ],
        minAge: 18,
      });
      expect(errs).toContain('child');
    });

    it('allows children on family-friendly experience', () => {
      const errs = validateStep2({
        profileQtys: [{ profile: 'child', qty: 2, unitPrice: 210 }],
        minAge: 4,
      });
      expect(errs).toBeEmpty();
    });
  });

  // ── validateStep3 — payer ──────────────────────────────────────────────────
  describe('validateStep3 — payer validation', () => {
    const validPayer = {
      fullName: 'Maria Fernanda Silva',
      cpf:      '123.456.789-09',
      email:    'maria@test.com',
      phone:    '(11) 99999-9999',
      birthdate:'1990-06-15',
    };

    it('passes with valid payer', () => {
      const errs = validateStep3(validPayer);
      expect(errs).toBeEmpty();
    });

    it('fails with missing fullName', () => {
      const errs = validateStep3({ ...validPayer, fullName: '' });
      expect(errs).toContain('fullName');
    });

    it('fails with invalid email', () => {
      const errs = validateStep3({ ...validPayer, email: 'not-email' });
      expect(errs).toContain('email');
    });

    it('fails with minor birthdate', () => {
      const errs = validateStep3({ ...validPayer, birthdate: '2015-01-01' });
      expect(errs).toContain('birthdate');
    });

    it('fails with null payer', () => {
      const errs = validateStep3(null);
      expect(Object.keys(errs).length).toBeGreaterThan(0);
    });
  });

  // ── validateStep4 — participants ────────────────────────────────────────────
  describe('validateStep4 — participants', () => {
    const profileQtys = [{ profile: 'adult', qty: 2, unitPrice: 390 }];
    const validParts  = [
      { fullName: 'João',  docNumber: '111.111.111-11', birthdate: '1985-03-10', profile: 'adult' },
      { fullName: 'Maria', docNumber: '222.222.222-22', birthdate: '1990-07-22', profile: 'adult' },
    ];

    it('passes with correct number of participants', () => {
      const errs = validateStep4(validParts, profileQtys);
      expect(errs).toBeEmpty();
    });

    it('fails when count mismatches', () => {
      const errs = validateStep4([validParts[0]], profileQtys);
      expect(errs).toContain('_count');
    });

    it('fails when fullName is empty', () => {
      const errs = validateStep4([{ ...validParts[0], fullName: '' }, validParts[1]], profileQtys);
      expect(errs).toContain('p0_fullName');
    });

    it('fails when birthdate is invalid', () => {
      const errs = validateStep4([{ ...validParts[0], birthdate: 'not-a-date' }, validParts[1]], profileQtys);
      expect(errs).toContain('p0_birthdate');
    });
  });

  // ── validateStep5 — emergency contact ──────────────────────────────────────
  describe('validateStep5 — emergency contact', () => {
    it('passes with all fields', () => {
      const errs = validateStep5({ fullName: 'João', phone: '(11) 98888-7777', relationship: 'Pai' });
      expect(errs).toBeEmpty();
    });

    it('fails when fullName missing', () => {
      const errs = validateStep5({ fullName: '', phone: '(11) 98888-7777', relationship: 'Pai' });
      expect(errs).toContain('fullName');
    });

    it('fails when phone missing', () => {
      const errs = validateStep5({ fullName: 'João', phone: '', relationship: 'Pai' });
      expect(errs).toContain('phone');
    });
  });

  // ── validateStep6 — terms ───────────────────────────────────────────────────
  describe('validateStep6 — terms acceptance', () => {
    it('passes when all required terms accepted', () => {
      const errs = validateStep6({ terms: true, cancellation: true, riskAwareness: true, imageConsent: false });
      expect(errs).toBeEmpty();
    });

    it('fails when terms not accepted', () => {
      const errs = validateStep6({ terms: false, cancellation: true, riskAwareness: true });
      expect(errs).toContain('terms');
    });

    it('fails when cancellation not accepted', () => {
      const errs = validateStep6({ terms: true, cancellation: false, riskAwareness: true });
      expect(errs).toContain('cancellation');
    });

    it('imageConsent is optional — no error when false', () => {
      const errs = validateStep6({ terms: true, cancellation: true, riskAwareness: true, imageConsent: false });
      expect(errs).toBeEmpty();
    });
  });

  // ── validateStep7 — payment method ─────────────────────────────────────────
  describe('validateStep7 — payment', () => {
    it('passes with pix', () => {
      expect(validateStep7({ paymentMethod: 'pix' })).toBeEmpty();
    });

    it('passes with credit_card', () => {
      expect(validateStep7({ paymentMethod: 'credit_card' })).toBeEmpty();
    });

    it('passes with signal_balance at 50%', () => {
      expect(validateStep7({ paymentMethod: 'signal_balance', signalPct: 50 })).toBeEmpty();
    });

    it('fails with signal_balance below 30%', () => {
      const errs = validateStep7({ paymentMethod: 'signal_balance', signalPct: 20 });
      expect(errs).toContain('signalPct');
    });

    it('fails with signal_balance above 70%', () => {
      const errs = validateStep7({ paymentMethod: 'signal_balance', signalPct: 80 });
      expect(errs).toContain('signalPct');
    });

    it('fails with invalid method', () => {
      const errs = validateStep7({ paymentMethod: 'bitcoin' });
      expect(errs).toContain('paymentMethod');
    });
  });

  // ── computeTotal ────────────────────────────────────────────────────────────
  describe('computeTotal — pricing', () => {
    it('calculates correctly with multiple profiles', () => {
      const qtys = [
        { profile: 'adult',  qty: 2, unitPrice: 390 },
        { profile: 'child',  qty: 1, unitPrice: 210 },
        { profile: 'senior', qty: 1, unitPrice: 332 },
      ];
      expect(computeTotal(qtys)).toBe(2 * 390 + 210 + 332);
    });

    it('returns 0 for empty array', () => {
      expect(computeTotal([])).toBe(0);
    });

    it('respects qty = 0', () => {
      expect(computeTotal([{ profile: 'adult', qty: 0, unitPrice: 390 }])).toBe(0);
    });
  });

  // ── computeSplit ────────────────────────────────────────────────────────────
  describe('computeSplit — signal/balance', () => {
    it('pix: entire amount is signal, no balance', () => {
      const s = computeSplit(1000, 'pix');
      expect(s.signalAmount).toBe(1000);
      expect(s.balanceAmount).toBe(0);
    });

    it('credit_card: entire amount is signal', () => {
      const s = computeSplit(1000, 'credit_card');
      expect(s.signalAmount).toBe(1000);
      expect(s.balanceAmount).toBe(0);
    });

    it('signal_balance 50%: splits correctly', () => {
      const s = computeSplit(1000, 'signal_balance', 50);
      expect(s.signalAmount).toBe(500);
      expect(s.balanceAmount).toBe(500);
    });

    it('signal_balance 30%: correct min split', () => {
      const s = computeSplit(1000, 'signal_balance', 30);
      expect(s.signalAmount).toBe(300);
      expect(s.balanceAmount).toBe(700);
    });

    it('balanceDueDate is ~7 days from now', () => {
      const s = computeSplit(1000, 'signal_balance', 50);
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const diff = s.balanceDueDate - Date.now();
      expect(diff > sevenDaysMs - 5000).toBeTruthy();
      expect(diff < sevenDaysMs + 5000).toBeTruthy();
    });
  });

  // ── STATUS_TRANSITIONS ──────────────────────────────────────────────────────
  describe('STATUS_TRANSITIONS — allowed state machine', () => {
    it('draft can go to pending_payment', () => {
      expect(STATUS_TRANSITIONS.draft.includes('pending_payment')).toBeTruthy();
    });

    it('draft can be cancelled', () => {
      expect(STATUS_TRANSITIONS.draft.includes('cancelled')).toBeTruthy();
    });

    it('pending_payment → reserved is allowed', () => {
      expect(STATUS_TRANSITIONS.pending_payment.includes('reserved')).toBeTruthy();
    });

    it('cancelled has no outgoing transitions', () => {
      expect(STATUS_TRANSITIONS.cancelled).toHaveLength(0);
    });

    it('completed has no outgoing transitions', () => {
      expect(STATUS_TRANSITIONS.completed).toHaveLength(0);
    });

    it('confirmed can become no_show', () => {
      expect(STATUS_TRANSITIONS.confirmed.includes('no_show')).toBeTruthy();
    });
  });

  // ── MockPaymentProvider ─────────────────────────────────────────────────────
  describe('MockPaymentProvider — process()', () => {
    it('resolves a successful PIX payment', async () => {
      const provider = new MockPaymentProvider();
      // Monkey-patch Math.random to avoid 10% decline
      const origRandom = Math.random;
      Math.random = () => 0.5;
      const result = await provider.process({
        bookingId: 'TEST-01', method: 'pix', amount: 39000,
        payerName: 'Test', payerCpf: '000.000.000-00', payerEmail: 'a@b.com',
        cardToken: null, installments: null,
      });
      Math.random = origRandom;
      expect(result.success).toBeTruthy();
      expect(typeof result.pixCode).toBe('string');
      expect(result.amountPaid).toBe(39000);
    });

    it('returns pixCode only for pix method', async () => {
      const provider = new MockPaymentProvider();
      const origRandom = Math.random;
      Math.random = () => 0.5;
      const result = await provider.process({
        bookingId: 'TEST-02', method: 'credit_card', amount: 39000,
        payerName: 'Test', payerCpf: '000.000.000-00', payerEmail: 'a@b.com',
        cardToken: null, installments: '3x',
      });
      Math.random = origRandom;
      expect(result.success).toBeTruthy();
      expect(result.pixCode).toBe(null);
    });

    it('simulates card decline when random < 0.1', async () => {
      const provider = new MockPaymentProvider();
      const origRandom = Math.random;
      Math.random = () => 0.05; // force decline
      const result = await provider.process({
        bookingId: 'TEST-03', method: 'credit_card', amount: 39000,
        payerName: 'Test', payerCpf: '000.000.000-00', payerEmail: 'a@b.com',
        cardToken: null, installments: null,
      });
      Math.random = origRandom;
      expect(result.success).toBeFalsy();
      expect(result.errorCode).toBe('CARD_DECLINED');
    });
  });

  // ── ReservationStore ─────────────────────────────────────────────────────────
  describe('ReservationStore — save / get / transition / recordPayment', () => {
    const booking = {
      id:             'STORE-TEST-01',
      experienceId:   'trekking-vale-sombra',
      exitId:         'exit-vs-01',
      meetingPointId: 'mp-vs-01-a',
      profileQtys:    [{ profile: 'adult', qty: 2, unitPrice: 390 }],
      payer:          { fullName: 'Test', cpf: '000.000.000-00', email: 't@t.com', phone: '(11) 99999-9999', birthdate: '1990-01-01', isAlsoParticipant: false },
      participants:   [],
      emergencyContact: { fullName: 'EC', phone: '(11) 98888-7777', relationship: 'Pai' },
      observations:   '',
      termsAcceptance:{ terms: true, cancellation: true, riskAwareness: true, imageConsent: true, acceptedAt: new Date().toISOString(), version: '2026-01' },
      paymentMethod:  'pix',
      totalAmount:    780,
      paidAmount:     0,
      pendingAmount:  780,
      paymentHistory: [],
      status:         'pending_payment',
      createdAt:      new Date().toISOString(),
      updatedAt:      new Date().toISOString(),
      voucherCode:    'ANATESTBB',
    };

    it('saves and retrieves a booking', () => {
      saveBooking(booking);
      const retrieved = getBooking('STORE-TEST-01');
      expect(retrieved.id).toBe('STORE-TEST-01');
      expect(retrieved.totalAmount).toBe(780);
    });

    it('transitions pending_payment → reserved', () => {
      const updated = transitionStatus('STORE-TEST-01', 'reserved');
      expect(updated.status).toBe('reserved');
    });

    it('throws on illegal transition reserved → pending_payment', () => {
      let threw = false;
      try { transitionStatus('STORE-TEST-01', 'pending_payment'); } catch { threw = true; }
      expect(threw).toBeTruthy();
    });

    it('records a payment', () => {
      const updated = recordPayment('STORE-TEST-01', {
        success: true, transactionId: 'TX-01', method: 'pix', amountPaid: 780,
        paidAt: new Date().toISOString(), pixCode: null, pixQrData: null, errorCode: null, errorMsg: null,
      }, 780);
      expect(updated.paidAmount).toBe(780);
      expect(updated.pendingAmount).toBe(0);
      expect(updated.paymentHistory).toHaveLength(1);
    });
  });
}

// ─── Runner + output ──────────────────────────────────────────────────────────

async function main() {
  // In Node, we need a simple localStorage/sessionStorage stub
  if (isNode) {
    const store = {};
    global.localStorage  = { getItem: k => store[k] ?? null, setItem: (k,v) => store[k]=v, removeItem: k => delete store[k] };
    global.sessionStorage = { getItem: k => store[`ss_${k}`] ?? null, setItem: (k,v) => store[`ss_${k}`]=v, removeItem: k => delete store[`ss_${k}`] };
  }

  await loadModules();
  runTests();

  // Report
  console.log(`\n${'─'.repeat(50)}`);
  _results.forEach(r => {
    if (r.type === 'suite') console.log(`\n▶ ${r.label}`);
    if (r.type === 'pass')  console.log(`  ✓ ${r.label}`);
    if (r.type === 'fail')  console.error(`  ✗ ${r.label}\n    ${r.error}`);
  });
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`${_passed} passed, ${_failed} failed\n`);

  return { passed: _passed, failed: _failed, results: _results };
}

export { main, _results };

// Auto-run when executed directly
main();
