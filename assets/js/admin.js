/**
 * @fileoverview admin.js — Guard de entrada para admin.html (raiz do projeto).
 *
 * Verifica a sessão Supabase + role do usuário em public.profiles.
 * - Usuário com role admin/operator → redireciona para admin/index.html
 * - Usuário sem permissão  → redireciona para index.html com mensagem
 * - Sem sessão             → redireciona para cliente.html (login)
 *
 * Este arquivo existe para que admin.html não retorne 404.
 * O backoffice completo está em admin/index.html + admin/admin.js.
 */

import { supabase } from './supabaseClient.js';

(async function adminGuard() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();

    if (!user || error) {
      // Sem sessão — redireciona para login preservando destino
      location.replace('cliente.html?redirect=admin');
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      // Perfil não encontrado — redireciona para home
      location.replace('index.html');
      return;
    }

    if (['admin', 'operator'].includes(profile.role)) {
      // Autorizado — redireciona para backoffice completo
      location.replace('admin/index.html');
    } else {
      // Papel insuficiente
      location.replace('index.html');
    }
  } catch (err) {
    console.error('[admin.js] Erro no guard:', err);
    location.replace('index.html');
  }
})();
