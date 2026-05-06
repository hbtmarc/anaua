/**
 * @fileoverview Cliente Supabase — Anauá Ecoturismo
 *
 * Usa window.supabase exposto pelo CDN (supabase-js@2).
 * Importe { supabase } onde precisar acessar o banco.
 *
 * IMPORTANTE: a chave aqui é a "publishable key" (anon),
 * segura para o navegador. Nunca use a service_role key no front-end.
 */

const SUPABASE_URL = 'https://dmclvlarnoimrrfndcsx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_5uEhWBG8FOnhK4FmoNfFcQ_4MP1jNbS';

// window.supabase é injetado pelo <script> do CDN antes deste módulo carregar.
if (!window.supabase) {
  console.error('[supabase] CDN não carregado. Adicione o <script> do Supabase antes dos módulos ES.');
}

let _client;
try {
  _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
  console.error('[supabase] Falha ao inicializar cliente:', e);
  // Stub mínimo — permite que initPage rode; todas as queries retornam erro graciosamente
  const _err = { message: 'Supabase não disponível' };
  const _res = () => Promise.resolve({ data: null, error: _err });
  const _q = () => { const o = { select: _q, eq: _q, neq: _q, order: _q, gte: _q, in: _q, single: _res, insert: _q, update: _q, delete: _q, upsert: _q }; o.then = (r) => Promise.resolve({ data: null, error: _err }).then(r); return o; };
  _client = {
    from:  () => _q(),
    auth:  { getSession: () => Promise.resolve({ data: { session: null }, error: null }),
             onAuthStateChange: (cb) => { cb('SIGNED_OUT', null); return { data: { subscription: { unsubscribe: () => {} } } }; } },
    rpc:   _res,
  };
}

export const supabase = _client;

// Expõe o cliente inicializado globalmente para uso em components.js e admin
// (necessário porque components.js não importa supabaseClient diretamente)
window.anauaDb = supabase;

console.log('[supabase] Cliente inicializado ✓');
