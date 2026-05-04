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

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Expõe o cliente inicializado globalmente para uso em components.js e admin
// (necessário porque components.js não importa supabaseClient diretamente)
window.anauaDb = supabase;

console.log('[supabase] Cliente inicializado ✓');
