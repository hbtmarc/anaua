/**
 * @fileoverview Sobre page — Anauá Ecoturismo
 */
import { STATS, TEAM } from './data.js';
import { initPage, observeAnimations } from './components.js';

initPage('sobre.html');
observeAnimations();

/* ── Stats ───────────────────────────────────────────────── */
const statsGrid = document.getElementById('stats-grid');
if (statsGrid) {
  const items = [
    { value: `${STATS.experiencesCount}+`,  label: 'Roteiros exclusivos' },
    { value: `${STATS.satisfactionPct}%`,   label: 'de satisfação' },
    { value: `${(STATS.participantsCount / 1000).toFixed(1)}k+`, label: 'Participantes' },
    { value: `${STATS.yearsActive}`,        label: 'anos de experiência' },
  ];
  statsGrid.innerHTML = items.map(s => `
    <div class="stat" role="img" aria-label="${s.value} ${s.label}">
      <div class="stat__value">${s.value}</div>
      <div class="stat__label">${s.label}</div>
    </div>
  `).join('');
}

/* ── Values ──────────────────────────────────────────────── */
const values = [
  { icon: '🌱', title: 'Sustentabilidade', desc: 'Cada roteiro passa por avaliação de impacto ambiental. Parte das receitas financia projetos de reflorestamento.' },
  { icon: '🤝', title: 'Comunidade', desc: 'Priorizamos guias e fornecedores locais. O turismo que praticamos gera renda onde a natureza ainda existe.' },
  { icon: '🔬', title: 'Ciência', desc: 'Naturalistas e biólogos revisam cada experiência para garantir precisão e respeito aos ecossistemas.' },
  { icon: '💫', title: 'Autenticidade', desc: 'Sem scripts decorativos. Cada saída é única, construída com carinho e entregue com integridade.' },
];

const valuesGrid = document.getElementById('values-grid');
if (valuesGrid) {
  valuesGrid.innerHTML = values.map(v => `
    <article class="value-card" data-animate>
      <div class="value-card__icon" aria-hidden="true">${v.icon}</div>
      <h3 class="value-card__title">${v.title}</h3>
      <p class="value-card__desc">${v.desc}</p>
    </article>
  `).join('');
}

/* ── Team ────────────────────────────────────────────────── */
const teamGrid = document.getElementById('team-grid');
if (teamGrid) {
  teamGrid.innerHTML = TEAM.map(member => `
    <article class="team-card" data-animate>
      <div class="team-card__photo" aria-hidden="true">${member.avatarInitials}</div>
      <div class="team-card__body">
        <h3 class="team-card__name">${member.name}</h3>
        <p class="team-card__role">${member.role}</p>
        <p class="team-card__bio">${member.bio}</p>
      </div>
    </article>
  `).join('');
}
