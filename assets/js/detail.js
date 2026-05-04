/**
 * @fileoverview Experience detail page — Anauá Ecoturismo
 */
import { EXPERIENCES, CATEGORIES, getNextActiveExit, formatBRL, formatDate } from './data.js';
import {
  initPage, renderBreadcrumb, renderExperienceCard, renderSkeletonCards,
  Icon, showToast, openModal, observeAnimations,
} from './components.js';

initPage('experiencias.html');

/* ── Load experience ─────────────────────────────────────── */
const params = new URLSearchParams(location.search);
const expId  = params.get('id');
const exp    = EXPERIENCES.find(e => e.id === expId);

if (!exp) {
  document.getElementById('detail-content')?.replaceWith((() => {
    const d = document.createElement('div');
    d.className = 'empty-state';
    d.style.gridColumn = '1/-1';
    d.innerHTML = `
      <svg class="empty-state__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <h2 class="empty-state__title">Experiência não encontrada</h2>
      <p class="empty-state__desc">O link pode estar desatualizado ou a experiência foi removida.</p>
      <a href="experiencias.html" class="btn btn--primary">Ver todas as experiências</a>
    `;
    return d;
  })());
} else {
  renderPage(exp);
}

/* ── Main render ─────────────────────────────────────────── */
function renderPage(/** @type {import('./data.js').EXPERIENCES[0]} */ exp) {
  const BASE_URL = 'https://www.anaua.com.br';

  // ── <title> & description
  document.title = `${exp.title} — Anauá Ecoturismo`;
  const descMeta = document.getElementById('page-desc-meta');
  if (descMeta) descMeta.setAttribute('content', exp.subtitle);

  // ── Open Graph (IDs injected in experiencia.html)
  const setMeta = (id, value) => { const el = document.getElementById(id); if (el && value) el.setAttribute('content', value); };
  const pageUrl = `${BASE_URL}/experiencia.html?id=${encodeURIComponent(exp.id)}`;
  setMeta('og-title', `${exp.title} — Anauá Ecoturismo`);
  setMeta('og-desc',  exp.subtitle);
  setMeta('og-url',   pageUrl);
  setMeta('og-image', exp.coverImage?.startsWith('http') ? exp.coverImage : `${BASE_URL}/${exp.coverImage}`);
  setMeta('tw-title', `${exp.title} — Anauá Ecoturismo`);
  setMeta('tw-image', exp.coverImage?.startsWith('http') ? exp.coverImage : `${BASE_URL}/${exp.coverImage}`);

  // ── Canonical
  const canonical = document.getElementById('canonical');
  if (canonical) canonical.setAttribute('href', pageUrl);

  // ── Structured data (TouristAttraction)
  const sd = document.createElement('script');
  sd.type = 'application/ld+json';
  sd.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'TouristAttraction',
    name: exp.title,
    description: exp.subtitle,
    url: pageUrl,
    image: exp.coverImage,
    touristType: exp.category,
    geo: { '@type': 'GeoCoordinates' },
    offers: {
      '@type': 'Offer',
      price: exp.pricePerPerson,
      priceCurrency: 'BRL',
      availability: exp.status === 'active' ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
      url: `${BASE_URL}/reserva.html?id=${encodeURIComponent(exp.id)}`,
    },
  });
  document.head.appendChild(sd);

  // Breadcrumb
  const bc = document.getElementById('breadcrumb-container');
  if (bc) bc.innerHTML = renderBreadcrumb([
    { label: 'Início', href: 'index.html' },
    { label: 'Experiências', href: 'experiencias.html' },
    { label: exp.title },
  ]);

  // Hero
  renderHero(exp);

  // Content
  renderContent(exp);

  // Booking sidebar
  renderBookingBox(exp);

  // Related
  renderRelated(exp);

  // Sticky CTA price
  const stickyPrice = document.getElementById('sticky-price');
  if (stickyPrice) stickyPrice.textContent = formatBRL(exp.pricePerPerson);

  // Sticky CTA show/hide
  initStickyCTA();

  observeAnimations();
}

/* ── Hero ────────────────────────────────────────────────── */
function renderHero(exp) {
  const hero = document.getElementById('detail-hero');
  if (!hero) return;
  hero.innerHTML = `
    <img
      src="${exp.coverImage}"
      alt="${exp.title}"
      fetchpriority="high"
      onerror="this.src='assets/img/placeholder.svg'"
      style="width:100%;height:100%;object-fit:cover"
    />
    <div class="detail-hero__overlay" aria-hidden="true"></div>
  `;
}

/* ── Main content ────────────────────────────────────────── */
function renderContent(exp) {
  const el = document.getElementById('detail-content');
  if (!el) return;

  const catLabel = CATEGORIES.find(c => c.id === exp.category)?.label ?? exp.category;
  const nextExit = getNextActiveExit(exp);

  el.innerHTML = `
    <!-- Header -->
    <div class="detail-header animate-fade-in-up">
      <div class="detail-header__badges">
        <span class="badge badge--level-${exp.difficulty}">${exp.difficulty}</span>
        <span class="badge" style="background:var(--color-offwhite);color:var(--color-muted);border:1px solid var(--color-stone)">${catLabel}</span>
        ${exp.isNew ? '<span class="badge badge--new">Novo</span>' : ''}
        ${!nextExit ? '<span class="badge badge--sold-out">Esgotado</span>' : ''}
      </div>
      <h1 class="detail-header__title">${exp.title}</h1>
      <p class="detail-header__subtitle">${exp.subtitle}</p>
      <div class="detail-header__meta">
        <span class="detail-meta-item">${Icon.clock} <strong>${exp.durationLabel}</strong></span>
        <span class="detail-meta-item">${Icon.map} <strong>${exp.location}</strong></span>
        <span class="detail-meta-item">${Icon.users} Máx. <strong>${exp.maxParticipants} pessoas</strong></span>
        ${exp.distanceKm ? `<span class="detail-meta-item">${Icon.arrow} <strong>${exp.distanceKm} km</strong></span>` : ''}
        ${exp.minAge ? `<span class="detail-meta-item">👶 A partir de <strong>${exp.minAge} anos</strong></span>` : ''}
      </div>
    </div>

    <!-- Highlights -->
    <div class="detail-highlights" data-animate>
      ${exp.highlights.map(h => `<div class="detail-highlight">${h}</div>`).join('')}
    </div>

    <!-- Description -->
    <div class="detail-block">
      <h2 class="detail-block__title">Sobre a experiência</h2>
      <p class="detail-desc">${exp.description}</p>
    </div>

    <!-- Gallery -->
    <div class="detail-block" data-animate>
      <h2 class="detail-block__title">Galeria</h2>
      ${renderGallery(exp.gallery, exp.title)}
    </div>

    <!-- Exits / Saídas -->
    <div class="detail-block" data-animate>
      <h2 class="detail-block__title">Saídas disponíveis</h2>
      <div class="exit-list" id="exit-list">
        ${exp.nextExits.map(exit => renderExitItem(exit, exp)).join('')}
      </div>
    </div>

    <!-- Meeting points -->
    <div class="detail-block" data-animate id="meeting-block" style="display:none">
      <h2 class="detail-block__title">Pontos de encontro</h2>
      <div id="meeting-points-list" style="display:flex;flex-direction:column;gap:var(--sp-4)"></div>
    </div>

    <!-- Inclusions -->
    <div class="detail-block" data-animate>
      <h2 class="detail-block__title">O que está incluso</h2>
      <div class="detail-inclusions">
        <div>
          <p class="detail-inclusions__subtitle">✅ Incluso</p>
          <ul class="inclusion-list">
            ${exp.includes.map(i => `
              <li class="inclusion-list__item">
                <span class="inclusion-list__icon inclusion-list__icon--yes">${Icon.check}</span>
                ${i}
              </li>
            `).join('')}
          </ul>
        </div>
        <div>
          <p class="detail-inclusions__subtitle">❌ Não incluso</p>
          <ul class="inclusion-list">
            ${exp.excludes.map(e => `
              <li class="inclusion-list__item">
                <span class="inclusion-list__icon inclusion-list__icon--no">${Icon.x}</span>
                ${e}
              </li>
            `).join('')}
          </ul>
        </div>
      </div>
    </div>

    <!-- What to bring -->
    <div class="detail-block" data-animate>
      <h2 class="detail-block__title">O que levar</h2>
      <ul class="bring-list">
        ${exp.whatToBring.map(i => `<li class="bring-item">${i}</li>`).join('')}
      </ul>
    </div>

    <!-- Cancellation -->
    <div class="detail-block" data-animate>
      <h2 class="detail-block__title">Política de cancelamento</h2>
      <div class="cancellation-box">${exp.cancellationPolicy}</div>
    </div>
  `;

  // Wire exit selection
  initExitSelection(exp);
}

/* ── Gallery ─────────────────────────────────────────────── */
function renderGallery(images, alt) {
  if (!images.length) return '<p style="color:var(--color-muted);font-size:var(--text-sm)">Imagens em breve.</p>';

  const visible = images.slice(0, 5);
  const remaining = images.length - 5;

  const items = visible.map((src, i) => `
    <div class="gallery__item ${i === 4 && remaining > 0 ? 'gallery__more' : ''}"
         ${i === 4 && remaining > 0 ? `data-remaining="+${remaining}"` : ''}
         data-index="${i}"
         role="button"
         tabindex="0"
         aria-label="Ver foto ${i + 1}">
      <img src="${src}" alt="${alt} — foto ${i + 1}" loading="lazy" onerror="this.src='assets/img/placeholder.svg'" />
    </div>
  `).join('');

  setTimeout(() => {
    document.querySelectorAll('.gallery__item').forEach(item => {
      item.addEventListener('click', () => openGalleryModal(images, Number(item.getAttribute('data-index') ?? 0), alt));
      item.addEventListener('keydown', e => { if (e.key === 'Enter') item.click(); });
    });
  }, 0);

  return `<div class="gallery">${items}</div>`;
}

/* ── Gallery modal ───────────────────────────────────────── */
function openGalleryModal(images, startIndex, alt) {
  let current = startIndex;

  const getSlide = () => `
    <div style="text-align:center">
      <img
        src="${images[current]}"
        alt="${alt} — foto ${current + 1}"
        style="max-height:70vh;max-width:100%;border-radius:var(--radius-lg);margin:auto;display:block"
        onerror="this.src='assets/img/placeholder.svg'"
      />
      <p style="margin-top:var(--sp-3);color:var(--color-muted);font-size:var(--text-sm)">${current + 1} / ${images.length}</p>
    </div>
  `;

  const modal = openModal({
    title: alt,
    body: getSlide(),
    footer: images.length > 1 ? `
      <button class="btn btn--secondary" id="modal-prev">← Anterior</button>
      <button class="btn btn--primary" id="modal-next">Próxima →</button>
    ` : '',
  });

  const update = () => {
    const body = document.querySelector('.modal__body');
    if (body) body.innerHTML = getSlide();
  };

  document.getElementById('modal-prev')?.addEventListener('click', () => {
    current = (current - 1 + images.length) % images.length;
    update();
  });

  document.getElementById('modal-next')?.addEventListener('click', () => {
    current = (current + 1) % images.length;
    update();
  });
}

/* ── Exit item ───────────────────────────────────────────── */
function renderExitItem(exit, exp) {
  const isSoldOut = exit.status === 'sold_out' || exit.spotsAvailable === 0;
  const isLow     = exit.spotsAvailable > 0 && exit.spotsAvailable <= 4;

  return `
    <div
      class="exit-item ${isSoldOut ? 'exit-item--sold-out' : ''}"
      data-exit-id="${exit.id}"
      role="radio"
      aria-checked="false"
      tabindex="${isSoldOut ? -1 : 0}"
    >
      <div>
        <p class="exit-item__date">${Icon.calendar} ${exit.dateLabel}</p>
      </div>
      <div>
        ${isSoldOut
          ? '<span class="badge badge--sold-out">Esgotado</span>'
          : `<span class="exit-item__spots ${isLow ? 'is-low' : ''}">${exit.spotsAvailable} vaga${exit.spotsAvailable !== 1 ? 's' : ''} disponível${exit.spotsAvailable !== 1 ? 'is' : ''}</span>`
        }
      </div>
    </div>
  `;
}

/* ── Exit selection interaction ──────────────────────────── */
function initExitSelection(exp) {
  const exitList = document.getElementById('exit-list');
  if (!exitList) return;

  function selectExit(exitId) {
    const exit = exp.nextExits.find(e => e.id === exitId);
    if (!exit || exit.spotsAvailable === 0) return;

    exitList.querySelectorAll('.exit-item').forEach(el => {
      const isThis = el.getAttribute('data-exit-id') === exitId;
      el.classList.toggle('is-selected', isThis);
      el.setAttribute('aria-checked', String(isThis));
    });

    // Update booking box select
    const bookingSelect = document.getElementById('exit-select');
    if (bookingSelect instanceof HTMLSelectElement) bookingSelect.value = exitId;

    // Show meeting points
    showMeetingPoints(exit);
  }

  exitList.querySelectorAll('.exit-item:not(.exit-item--sold-out)').forEach(item => {
    item.addEventListener('click', () => selectExit(item.getAttribute('data-exit-id') ?? ''));
    item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') item.click(); });
  });

  // Auto-select first available
  const firstAvailable = exp.nextExits.find(e => e.spotsAvailable > 0);
  if (firstAvailable) selectExit(firstAvailable.id);
}

/* ── Meeting points ──────────────────────────────────────── */
function showMeetingPoints(exit) {
  const block = document.getElementById('meeting-block');
  const list  = document.getElementById('meeting-points-list');
  if (!block || !list) return;

  block.style.display = 'block';
  list.innerHTML = exit.meetingPoints.map(mp => `
    <div class="meeting-card">
      <div class="meeting-card__header">
        <p class="meeting-card__name">${mp.name}</p>
        <div class="meeting-card__time">
          ${Icon.clock} ${mp.time}
          <span class="meeting-card__tolerance">(tol. ${mp.toleranceMinutes}min)</span>
        </div>
      </div>
      <p class="meeting-card__address">${Icon.map} ${mp.address}</p>
    </div>
  `).join('');
}

/* ── Booking Box (sidebar) ───────────────────────────────── */
function renderBookingBox(exp) {
  const box = document.getElementById('booking-box');
  if (!box) return;

  const activeExits = exp.nextExits.filter(e => e.spotsAvailable > 0);

  box.innerHTML = `
    <div class="booking-box__price">
      <p class="booking-box__from">a partir de</p>
      <p class="booking-box__value">${formatBRL(exp.pricePerPerson)}</p>
      <p class="booking-box__per">por pessoa</p>
    </div>

    ${activeExits.length ? `
      <div class="booking-box__row">
        <label class="booking-box__label" for="exit-select">Saída</label>
        <select id="exit-select" class="booking-box__select" aria-label="Selecionar data da saída">
          ${activeExits.map(e => `<option value="${e.id}">${e.dateLabel} — ${e.spotsAvailable} vaga${e.spotsAvailable !== 1 ? 's' : ''}</option>`).join('')}
        </select>
      </div>

      <div class="booking-box__row">
        <label class="booking-box__label" for="pax-select">Participantes</label>
        <select id="pax-select" class="booking-box__select" aria-label="Número de participantes">
          ${Array.from({ length: Math.min(exp.maxParticipants, 10) }, (_, i) => i + 1).map(n =>
            `<option value="${n}">${n} pessoa${n !== 1 ? 's' : ''}</option>`
          ).join('')}
        </select>
      </div>

      <div class="booking-box__total">
        <span>Total estimado</span>
        <span class="booking-box__total-value" id="booking-total">${formatBRL(exp.pricePerPerson)}</span>
      </div>

      <button class="btn btn--primary btn--full btn--lg" id="reserve-btn">
        Reservar vaga ${Icon.arrow}
      </button>

      <p style="font-size:var(--text-xs);color:var(--color-muted);text-align:center;line-height:var(--leading-snug)">
        Sem cobrança agora. Você confirma após verificar os detalhes.
      </p>
    ` : `
      <div style="text-align:center;padding:var(--sp-6) 0">
        <p style="font-family:var(--font-serif);font-size:var(--text-lg);color:var(--color-deep);margin-bottom:var(--sp-3)">Esgotado</p>
        <p style="font-size:var(--text-sm);color:var(--color-muted);margin-bottom:var(--sp-5)">Todas as vagas foram preenchidas. Entre na lista de espera — avisamos se abrirem novas vagas.</p>
        <button class="btn btn--secondary btn--full" id="waitlist-btn">Entrar na lista de espera</button>
      </div>
    `}
  `;

  // Wire total calc
  const exitSelect = document.getElementById('exit-select');
  const paxSelect  = document.getElementById('pax-select');
  const totalEl    = document.getElementById('booking-total');

  function updateTotal() {
    if (!paxSelect || !totalEl) return;
    const pax = Number((paxSelect instanceof HTMLSelectElement ? paxSelect.value : '1'));
    totalEl.textContent = formatBRL(exp.pricePerPerson * pax);
  }

  paxSelect?.addEventListener('change', updateTotal);

  // Reserve button
  document.getElementById('reserve-btn')?.addEventListener('click', () => {
    if (!(exitSelect instanceof HTMLSelectElement) || !(paxSelect instanceof HTMLSelectElement)) return;
    const exitId = exitSelect.value;
    const pax    = paxSelect.value;
    const exit   = exp.nextExits.find(e => e.id === exitId);
    if (!exit) return;

    const { close } = openModal({
      title: 'Confirmar reserva',
      body: `
        <p style="font-size:var(--text-sm);color:var(--color-muted);margin-bottom:var(--sp-5)">Você está pré-reservando:</p>
        <div style="background:var(--color-offwhite);border-radius:var(--radius-lg);padding:var(--sp-5);display:flex;flex-direction:column;gap:var(--sp-3)">
          <p><strong>${exp.title}</strong></p>
          <p style="font-size:var(--text-sm);color:var(--color-muted)">${Icon.calendar} Saída: ${exit.dateLabel}</p>
          <p style="font-size:var(--text-sm);color:var(--color-muted)">${Icon.users} ${pax} participante${Number(pax) !== 1 ? 's' : ''}</p>
          <p style="font-size:var(--text-sm);font-weight:600;color:var(--color-deep)">Total: ${formatBRL(exp.pricePerPerson * Number(pax))}</p>
        </div>
        <p style="font-size:var(--text-xs);color:var(--color-muted);margin-top:var(--sp-4);line-height:var(--leading-loose)">
          Ao continuar, você concorda com os
          <a href="termos.html" style="color:var(--color-forest)">Termos de Uso</a> e a
          <a href="privacidade.html" style="color:var(--color-forest)">Política de Privacidade</a> da Anauá.
        </p>
      `,
      footer: `
        <button class="btn btn--secondary" id="modal-cancel-btn">Cancelar</button>
        <button class="btn btn--primary" id="modal-confirm-btn">Confirmar e ir para o checkout</button>
      `,
    });

    document.getElementById('modal-cancel-btn')?.addEventListener('click', close);
    document.getElementById('modal-confirm-btn')?.addEventListener('click', () => {
      close();
      location.href = `reserva.html?id=${exp.id}`;
    });
  });

  // Waitlist button
  document.getElementById('waitlist-btn')?.addEventListener('click', () => {
    showToast('Você foi adicionado à lista de espera! Avisaremos por e-mail.', 'success');
  });
}

/* ── Related ─────────────────────────────────────────────── */
function renderRelated(exp) {
  const grid = document.getElementById('related-grid');
  if (!grid) return;

  const related = EXPERIENCES
    .filter(e => e.id !== exp.id && (e.category === exp.category || e.region === exp.region))
    .slice(0, 3);

  if (!related.length) {
    document.getElementById('related-section')?.remove();
    return;
  }

  grid.innerHTML = related.map(exp => {
    const { renderExperienceCard: rc } = { renderExperienceCard: require => require };
    return `<!-- related-${exp.id} -->`;
  }).join('');

  // Import the render function properly
  import('./components.js').then(({ renderExperienceCard }) => {
    grid.innerHTML = related.map(renderExperienceCard).join('');
  });
}

/* ── Sticky CTA ──────────────────────────────────────────── */
function initStickyCTA() {
  const cta     = document.getElementById('sticky-cta');
  const bookBox = document.getElementById('booking-box');
  if (!cta || !bookBox) return;

  const obs = new IntersectionObserver(([entry]) => {
    cta.classList.toggle('is-hidden', entry.isIntersecting);
  }, { threshold: 0.5 });

  obs.observe(bookBox);

  document.getElementById('sticky-reserve-btn')?.addEventListener('click', e => {
    e.preventDefault();
    bookBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}
