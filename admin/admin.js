import { supabase } from '../assets/js/supabaseClient.js';
import { getCurrentUser, getCurrentProfile, getAdminDashboardCounts, getAdminReservations } from '../assets/js/services/SupabaseBookingService.js';

const $ = (id) => document.getElementById(id);
document.body.style.visibility = 'hidden';

function toast(msg){ const t=$('adm-toasts'); if(!t)return; const el=document.createElement('div'); el.className='adm-toast is-info'; el.textContent=msg; t.appendChild(el); setTimeout(()=>el.remove(),3000); }

async function guard() {
  const user = await getCurrentUser();
  if (!user) {
    location.replace('login.html');
    return null;
  }
  const profile = await getCurrentProfile();
  if (!profile || !['admin','operator'].includes(profile.role)) {
    $('adm-main').innerHTML = '<div class="adm-empty"><p>Acesso não autorizado.</p></div>';
    document.body.style.visibility = '';
    return null;
  }
  $('adm-user-name').textContent = profile.full_name || user.email;
  $('adm-user-avatar').textContent = (profile.full_name || user.email)[0].toUpperCase();
  return { user, profile };
}

async function renderDashboard() {
  const counts = await getAdminDashboardCounts();
  $('adm-main').innerHTML = `<section class="adm-kpis"><div class="adm-kpi"><span>Experiências ativas</span><strong>${counts.activeExperiences ?? '—'}</strong></div><div class="adm-kpi"><span>Saídas agendadas</span><strong>${counts.scheduledDepartures ?? '—'}</strong></div><div class="adm-kpi"><span>Reservas</span><strong>${counts.reservations ?? '—'}</strong></div><div class="adm-kpi"><span>Pagamentos pendentes</span><strong>${counts.pendingPayments ?? '—'}</strong></div><div class="adm-kpi"><span>Participantes</span><strong>${counts.participants ?? '—'}</strong></div></section><div id="admin-res-list"></div>`;
  const rows = await getAdminReservations();
  const list = $('admin-res-list');
  if (!rows.ok) { list.innerHTML = '<p>Sem permissão para listar reservas no momento.</p>'; return; }
  list.innerHTML = rows.data.map(r => `<article class="adm-card"><strong>${r.reservation_code || r.id}</strong><p>${r.customer_name || ''} • ${r.reservation_status || ''}</p></article>`).join('');
}

$('admin-logout-btn')?.addEventListener('click', async ()=>{ await supabase.auth.signOut(); location.replace('login.html'); });

(async ()=>{
  const ok = await guard();
  if (!ok) return;
  await renderDashboard();
  document.body.style.visibility = '';
  toast('Backoffice carregado.');
})();
