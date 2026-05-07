/**
 * @fileoverview customerRepo.js — CRUD para tabelas da Área do Cliente.
 *
 *   • customer_profiles       — dados pessoais
 *   • emergency_contacts      — contato de emergência
 *   • customer_payment_methods — metadados de pagamento (sem PAN ou CVV)
 *
 * Todas as operações dependem de auth.uid() via RLS.
 * Nunca passar número de cartão completo ou CVV neste módulo.
 */

import { supabase } from '../supabaseClient.js';

// ─── customer_profiles ────────────────────────────────────────────────────────

/**
 * Carrega o perfil do cliente autenticado.
 * @returns {Promise<{ ok: boolean, data: object|null, error: string|null }>}
 */
export async function getCustomerProfile() {
  const { data, error } = await supabase
    .from('customer_profiles')
    .select('id, full_name, document_number, birthdate, phone, email, preferred_boarding_point_id, default_participants_count')
    .maybeSingle();
  if (error) {
    // 42P01 = table not found (migration not run yet) → silent
    if (error.code === '42P01') return { ok: true, data: null, error: null };
    return { ok: false, data: null, error: error.message };
  }
  return { ok: true, data: data ?? null, error: null };
}

/**
 * Salva (upsert) o perfil do cliente autenticado.
 * Campos de dados pessoais apenas — sem cartão, sem senha.
 * @param {{
 *   userId: string,
 *   fullName?: string,
 *   documentNumber?: string,
 *   birthdate?: string|null,
 *   phone?: string,
 *   email?: string,
 *   preferredBoardingPointId?: string|null,
 *   defaultParticipantsCount?: number,
 * }} data
 * @returns {Promise<{ ok: boolean, error: string|null }>}
 */
export async function upsertCustomerProfile(data) {
  const row = {
    user_id:                      data.userId,
    full_name:                    data.fullName             ?? null,
    document_number:              data.documentNumber       ?? null,
    birthdate:                    data.birthdate            ?? null,
    phone:                        data.phone                ?? null,
    email:                        data.email                ?? null,
    preferred_boarding_point_id:  data.preferredBoardingPointId ?? null,
    default_participants_count:   data.defaultParticipantsCount  ?? 1,
  };
  const { error } = await supabase
    .from('customer_profiles')
    .upsert(row, { onConflict: 'user_id' });
  if (error) {
    // 42P01 = tabela inexistente; 403 = RLS não configurado
    if (error.code === '42P01' || error.status === 403) {
      console.warn('[customerRepo] customer_profiles indisponível — execute a migration customer_account_area.sql');
      return { ok: false, error: 'Tabela não encontrada. Execute a migration customer_account_area.sql no Supabase.' };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
}


// ─── emergency_contacts ───────────────────────────────────────────────────────

/**
 * Carrega o contato de emergência do usuário autenticado.
 * @returns {Promise<{ ok: boolean, data: object|null, error: string|null }>}
 */
export async function getEmergencyContact() {
  const { data, error } = await supabase
    .from('emergency_contacts')
    .select('id, full_name, phone, relationship, notes')
    .maybeSingle();
  if (error) {
    if (error.code === '42P01') return { ok: true, data: null, error: null };
    return { ok: false, data: null, error: error.message };
  }
  return { ok: true, data: data ?? null, error: null };
}

/**
 * Salva (upsert) o contato de emergência do usuário autenticado.
 * @param {{
 *   userId: string,
 *   fullName: string,
 *   phone: string,
 *   relationship: string,
 *   notes?: string,
 * }} data
 * @returns {Promise<{ ok: boolean, error: string|null }>}
 */
export async function upsertEmergencyContact(data) {
  const row = {
    user_id:      data.userId,
    full_name:    data.fullName     ?? null,
    phone:        data.phone        ?? null,
    relationship: data.relationship ?? null,
    notes:        data.notes        ?? null,
  };
  const { error } = await supabase
    .from('emergency_contacts')
    .upsert(row, { onConflict: 'user_id' });
  if (error) {
    if (error.code === '42P01' || error.status === 403) {
      console.warn('[customerRepo] emergency_contacts indisponível — execute a migration customer_account_area.sql');
      return { ok: false, error: 'Tabela não encontrada. Execute a migration customer_account_area.sql no Supabase.' };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
}


// ─── customer_payment_methods ─────────────────────────────────────────────────

/**
 * Lista os métodos de pagamento do usuário autenticado.
 * @returns {Promise<{ ok: boolean, data: object[], error: string|null }>}
 */
export async function listPaymentMethods() {
  const { data, error } = await supabase
    .from('customer_payment_methods')
    .select('id, provider, brand, last4, exp_month, exp_year, holder_name, is_default, created_at')
    .order('is_default', { ascending: false })
    .order('created_at',  { ascending: false });
  if (error) return { ok: false, data: [], error: error.message };
  return { ok: true, data: data ?? [], error: null };
}

/**
 * Adiciona um método de pagamento seguro (somente metadados — NUNCA o PAN ou CVV).
 * @param {{
 *   userId: string,
 *   brand: string,
 *   last4: string,
 *   expMonth: number,
 *   expYear: number,
 *   holderName: string,
 *   provider?: string,
 *   providerToken?: string,
 *   isDefault?: boolean,
 * }} data
 * @returns {Promise<{ ok: boolean, id: string|null, error: string|null }>}
 */
export async function addPaymentMethod(data) {
  const row = {
    user_id:        data.userId,
    provider:       data.provider       ?? 'manual',
    provider_token: data.providerToken  ?? null,
    brand:          data.brand          ?? null,
    last4:          String(data.last4 ?? '').slice(-4),
    exp_month:      data.expMonth       ?? null,
    exp_year:       data.expYear        ?? null,
    holder_name:    data.holderName     ?? null,
    is_default:     data.isDefault      ?? false,
  };
  const { data: inserted, error } = await supabase
    .from('customer_payment_methods')
    .insert(row)
    .select('id')
    .single();
  if (error) return { ok: false, id: null, error: error.message };
  return { ok: true, id: inserted?.id ?? null, error: null };
}

/**
 * Remove um método de pagamento pelo id.
 * A RLS garante que o usuário só pode deletar próprios registros.
 * @param {string} id
 * @returns {Promise<{ ok: boolean, error: string|null }>}
 */
export async function removePaymentMethod(id) {
  const { error } = await supabase
    .from('customer_payment_methods')
    .delete()
    .eq('id', id);
  return { ok: !error, error: error?.message ?? null };
}

/**
 * Define um cartão como padrão (desmarca os outros).
 * Faz dois updates: reset geral + set no escolhido.
 * @param {string} userId
 * @param {string} id
 * @returns {Promise<{ ok: boolean, error: string|null }>}
 */
export async function setDefaultPaymentMethod(userId, id) {
  const { error: e1 } = await supabase
    .from('customer_payment_methods')
    .update({ is_default: false })
    .eq('user_id', userId);
  if (e1) return { ok: false, error: e1.message };

  const { error: e2 } = await supabase
    .from('customer_payment_methods')
    .update({ is_default: true })
    .eq('id', id)
    .eq('user_id', userId);
  return { ok: !e2, error: e2?.message ?? null };
}
