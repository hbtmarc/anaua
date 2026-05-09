/**
 * @fileoverview PixProvider — gera código PIX EMV real (padrão Banco Central do Brasil)
 * usando as configurações salvas em app_settings.company_settings.
 *
 * Especificação: Manual de Padrões para Iniciação do PIX — BACEN v2.4
 * https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadrõesparaIniciaçãodoPix.pdf
 */

import { supabase } from '../supabaseClient.js';

// ── EMV TLV helpers ───────────────────────────────────────────────────────────

/** Formata um campo TLV: ID (2 dígitos) + tamanho (2 dígitos) + valor */
function tlv(id, value) {
  const v = String(value ?? '');
  const len = String(v.length).padStart(2, '0');
  return `${id}${len}${v}`;
}

/** CRC16-CCITT (0xFFFF) — exigido pelo padrão EMV Pix */
function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
    }
    crc &= 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Gera a string PIX Copia e Cola (EMV QR Code estático).
 *
 * @param {object} p
 * @param {string} p.pixKey       — chave PIX (email, telefone, CPF, CNPJ, chave aleatória)
 * @param {string} p.merchantName — nome do recebedor (max 25 chars)
 * @param {string} p.merchantCity — cidade do recebedor (max 15 chars)
 * @param {number} p.amount       — valor em centavos
 * @param {string} [p.txId]       — identificador da transação (max 25 chars, sem espaços)
 * @returns {string} código EMV completo com CRC16
 */
export function buildPixCode({ pixKey, merchantName, merchantCity, amount, txId = '***' }) {
  const name = merchantName.substring(0, 25).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 ]/g, '').trim();
  const city = merchantCity.substring(0, 15).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 ]/g, '').trim() || 'BRASIL';
  const tx   = (txId || '***').substring(0, 25).replace(/\s/g, '');
  const amtStr = (amount / 100).toFixed(2); // centavos → reais

  // ID 26 — Merchant Account Information (GUI + chave)
  const gui = tlv('00', 'BR.GOV.BCB.PIX');
  const key = tlv('01', pixKey);
  const mai = tlv('26', gui + key);

  // ID 62 — Additional Data Field (txid)
  const additionalData = tlv('62', tlv('05', tx));

  // Build payload sem CRC
  const payload =
    tlv('00', '01')           + // Payload Format Indicator
    mai                        + // Merchant Account Information
    tlv('52', '0000')          + // Merchant Category Code (0000 = não especificado)
    tlv('53', '986')           + // Transaction Currency (986 = BRL)
    (amount > 0 ? tlv('54', amtStr) : '') + // Transaction Amount
    tlv('58', 'BR')            + // Country Code
    tlv('59', name)            + // Merchant Name
    tlv('60', city)            + // Merchant City
    additionalData             + // Additional Data
    '6304';                      // CRC (valor calculado abaixo)

  return payload + crc16(payload);
}

/**
 * Gera um QR code SVG inline a partir do código PIX EMV.
 * Usa a API QR Server (no-cors public API) ou fallback visual.
 *
 * @param {string} pixCode
 * @returns {Promise<string>} URL da imagem (data-URI ou URL externa)
 */
export async function buildQrDataUrl(pixCode) {
  // API pública QR Server — funciona no front-end sem proxy
  const encoded = encodeURIComponent(pixCode);
  const apiUrl  = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encoded}&format=svg&margin=10`;

  try {
    const resp = await fetch(apiUrl, { mode: 'cors' });
    if (resp.ok) {
      const svg = await resp.text();
      return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
    }
  } catch (_) { /* fallback abaixo */ }

  // Fallback: retorna null (UI mostrará só o copia-e-cola)
  return null;
}

// ── Provider ──────────────────────────────────────────────────────────────────

/**
 * Lê as configurações de pagamento do Supabase e processa o PIX.
 * Para outros métodos (cartão, sinal) ainda usa o MockPaymentProvider.
 */
export class PixPaymentProvider {

  /** Cache das settings para não bater no DB a cada pagamento */
  #settings = null;

  async #loadSettings() {
    if (this.#settings) return this.#settings;
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'company_settings')
        .maybeSingle();
      this.#settings = data?.value ?? {};
    } catch (_) {
      this.#settings = {};
    }
    return this.#settings;
  }

  /**
   * @param {import('./PaymentService.js').PaymentRequest} req
   * @returns {Promise<import('../types/booking.types.js').PaymentResult>}
   */
  async process(req) {
    const now  = new Date().toISOString();
    const txId = `ANK-${Date.now().toString(36).toUpperCase()}-${req.bookingId.slice(-4).toUpperCase()}`;

    if (req.method !== 'pix') {
      // Não-PIX: simula sucesso (sem gateway real ainda)
      return {
        success:       true,
        transactionId: txId,
        method:        req.method,
        amountPaid:    req.amount,
        paidAt:        now,
        pixCode:       null,
        pixQrData:     null,
        errorCode:     null,
        errorMsg:      null,
      };
    }

    // PIX: usa configurações reais
    const cfg     = await this.#loadSettings();
    const pixCfg  = cfg?.payments?.pix ?? {};
    const pixKey  = pixCfg.key?.trim();
    const holder  = pixCfg.holder?.trim() || cfg?.company?.name?.trim() || 'Anaua Ecoturismo';
    const city    = cfg?.company?.address?.city?.trim() || 'BRASIL';

    if (!pixKey) {
      // Chave não configurada — retorna falha clara
      return {
        success:       false,
        transactionId: txId,
        method:        'pix',
        amountPaid:    0,
        paidAt:        now,
        pixCode:       null,
        pixQrData:     null,
        errorCode:     'PIX_NOT_CONFIGURED',
        errorMsg:      'Chave PIX não configurada. Configure em Backoffice → Configurações → Pagamentos.',
      };
    }

    const pixCode = buildPixCode({
      pixKey,
      merchantName: holder,
      merchantCity: city,
      amount:       req.amount,
      txId:         txId.slice(0, 25),
    });

    const pixQrData = await buildQrDataUrl(pixCode);

    return {
      success:       true,
      transactionId: txId,
      method:        'pix',
      amountPaid:    req.amount,
      paidAt:        now,
      pixCode,
      pixQrData,
      errorCode:     null,
      errorMsg:      null,
    };
  }

  async refund(transactionId) {
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

export const PIX_PROVIDER = new PixPaymentProvider();
