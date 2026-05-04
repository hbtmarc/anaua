/**
 * @fileoverview Mock data — Anauá Ecoturismo
 * Estruturas que espelham os domain types do sistema.
 *
 * @typedef {'day-experience'|'expedition'|'event'|'kids'} ExperienceCategory
 * @typedef {'iniciante'|'moderado'|'aventura'} DifficultyLevel
 * @typedef {'active'|'cancelled'|'sold_out'|'draft'} ExperienceStatus
 * @typedef {'pending'|'confirmed'|'cancelled'|'completed'|'waitlist'} ReservationStatus
 */

/** @type {Array<import('./types').Experience>} */
export const EXPERIENCES = [
  {
    id: 'trekking-vale-sombra',
    slug: 'trekking-vale-da-sombra',
    category: 'day-experience',
    status: 'active',
    title: 'Trekking Vale da Sombra',
    subtitle: 'Uma jornada entre vales e cachoeiras escondidas',
    description: 'Percurso de trilha moderada por dentro da Mata Atlântica preservada, com passagens por riachos, mirantes exclusivos e uma queda d\'água particular. Ideal para quem quer se reconectar com a natureza sem abrir mão do conforto.',
    coverImage: 'assets/img/exp-trekking-cover.jpg',
    gallery: [
      'assets/img/exp-trekking-1.jpg',
      'assets/img/exp-trekking-2.jpg',
      'assets/img/exp-trekking-3.jpg',
      'assets/img/exp-trekking-4.jpg',
      'assets/img/exp-trekking-5.jpg',
    ],
    durationHours: 8,
    durationLabel: '8 horas',
    minAge: 12,
    maxParticipants: 12,
    difficulty: 'moderado',
    distanceKm: 11,
    elevationGainM: 480,
    location: 'Paraty, RJ',
    region: 'Costa Verde',
    pricePerPerson: 390,
    priceChildren: 210,
    currency: 'BRL',
    includes: [
      'Guia especializado bilíngue',
      'Transfer saída/retorno do ponto de encontro',
      'Café da manhã e almoço na trilha',
      'Seguro de vida para atividade',
      'Kit hidratação (squeeze)',
      'Relatório fotográfico exclusivo',
    ],
    excludes: [
      'Transporte até o ponto de encontro',
      'Itens pessoais e medicamentos',
      'Bebidas extra além das inclusas',
    ],
    whatToBring: [
      'Tênis de trilha ou calçado fechado confortável',
      'Roupa para sujar / mudar',
      'Protetor solar e repelente',
      'Documento de identidade',
    ],
    cancellationPolicy: 'Cancelamento gratuito até 72h antes. Após esse prazo, 50% de reembolso.',
    tags: ['trilha','cachoeira','natureza','mata atlântica','fotografia'],
    nextExits: [
      {
        id: 'exit-vs-01',
        experienceId: 'trekking-vale-sombra',
        date: '2026-05-17',
        dateLabel: '17 mai',
        spotsTotal: 12,
        spotsAvailable: 4,
        status: 'active',
        meetingPoints: [
          { id: 'mp-vs-01-a', name: 'Praça da Bandeira — Paraty Centro', address: 'Praça da Bandeira, s/n — Centro, Paraty/RJ', time: '07:00', toleranceMinutes: 10, lat: -23.2177, lng: -44.7131 },
          { id: 'mp-vs-01-b', name: 'Pousada Maravilha — Trevo BR-101', address: 'Rodovia BR-101 km 562, Paraty/RJ', time: '07:30', toleranceMinutes: 10, lat: -23.2300, lng: -44.7050 },
        ],
      },
      {
        id: 'exit-vs-02',
        experienceId: 'trekking-vale-sombra',
        date: '2026-05-24',
        dateLabel: '24 mai',
        spotsTotal: 12,
        spotsAvailable: 12,
        status: 'active',
        meetingPoints: [
          { id: 'mp-vs-02-a', name: 'Praça da Bandeira — Paraty Centro', address: 'Praça da Bandeira, s/n — Centro, Paraty/RJ', time: '07:00', toleranceMinutes: 10, lat: -23.2177, lng: -44.7131 },
        ],
      },
    ],
    highlights: ['Vista 360° do Pico do Morcego','Banho em poço privativo','Almoço orgânico na trilha'],
    isNew: false,
    isFeatured: true,
  },

  {
    id: 'expedicao-pantanal',
    slug: 'expedicao-pantanal-selvagem',
    category: 'expedition',
    status: 'active',
    title: 'Expedição Pantanal Selvagem',
    subtitle: '4 dias em safári fotográfico no coração do Pantanal',
    description: 'Uma expedição de 4 dias pelo Pantanal mais íntegro, com safáris de barco e 4x4, observação de onças-pintadas, aves e capivaras em habitats intactos. Camping de luxo com camas, luz e chef.',
    coverImage: 'assets/img/exp-pantanal-cover.jpg',
    gallery: [
      'assets/img/exp-pantanal-1.jpg',
      'assets/img/exp-pantanal-2.jpg',
      'assets/img/exp-pantanal-3.jpg',
      'assets/img/exp-pantanal-4.jpg',
    ],
    durationHours: 96,
    durationLabel: '4 dias / 3 noites',
    minAge: 14,
    maxParticipants: 8,
    difficulty: 'moderado',
    distanceKm: null,
    elevationGainM: null,
    location: 'Cuiabá / Poconé, MT',
    region: 'Pantanal Norte',
    pricePerPerson: 3890,
    priceChildren: null,
    currency: 'BRL',
    includes: [
      'Voo fretado Cuiabá → base (ida e volta)',
      'Hospedagem em camping de luxo (3 noites)',
      'Todas as refeições (café, almoço, jantar)',
      'Safáris de barco e 4x4 (2× por dia)',
      'Guia naturalista certificado',
      'Seguro de aventura completo',
      'Relatório fotográfico profissional',
    ],
    excludes: [
      'Voo para Cuiabá',
      'Bebidas alcoólicas premium',
      'Equipamentos fotográficos pessoais',
    ],
    whatToBring: ['Roupas de cores neutras (bege/verde)','Câmera fotográfica','Protetor solar fator 70+','Chapéu de abas largas'],
    cancellationPolicy: 'Cancelamento gratuito até 30 dias antes. Entre 30 e 15 dias: 30% de reembolso. Menos de 15 dias: sem reembolso.',
    tags: ['pantanal','safari','fotografia','onça','natureza selvagem'],
    nextExits: [
      {
        id: 'exit-pan-01',
        experienceId: 'expedicao-pantanal',
        date: '2026-06-15',
        dateLabel: '15–18 jun',
        spotsTotal: 8,
        spotsAvailable: 3,
        status: 'active',
        meetingPoints: [
          { id: 'mp-pan-01-a', name: 'Aeroporto de Cuiabá — Terminal 2', address: 'Av. Gov. Júlio Campos, s/n — Cuiabá/MT', time: '06:00', toleranceMinutes: 15, lat: -15.6527, lng: -56.1166 },
        ],
      },
      {
        id: 'exit-pan-02',
        experienceId: 'expedicao-pantanal',
        date: '2026-07-13',
        dateLabel: '13–16 jul',
        spotsTotal: 8,
        spotsAvailable: 8,
        status: 'active',
        meetingPoints: [
          { id: 'mp-pan-02-a', name: 'Aeroporto de Cuiabá — Terminal 2', address: 'Av. Gov. Júlio Campos, s/n — Cuiabá/MT', time: '06:00', toleranceMinutes: 15, lat: -15.6527, lng: -56.1166 },
        ],
      },
    ],
    highlights: ['Observação de onça-pintada','Camping de luxo na beira do rio','Chef exclusivo nas refeições'],
    isNew: false,
    isFeatured: true,
  },

  {
    id: 'kids-trilha-bicho',
    slug: 'kids-trilha-dos-bichos',
    category: 'kids',
    status: 'active',
    title: 'Kids Trilha dos Bichos',
    subtitle: 'A primeira grande aventura das crianças na natureza',
    description: 'Trilha lúdica e educativa desenvolvida especialmente para crianças de 4 a 12 anos. Com paradas interativas, loupe, manual de campo e muito jogo de exploração, a experiência transforma a floresta num mundo de descobertas.',
    coverImage: 'assets/img/exp-kids-cover.jpg',
    gallery: [
      'assets/img/exp-kids-1.jpg',
      'assets/img/exp-kids-2.jpg',
      'assets/img/exp-kids-3.jpg',
    ],
    durationHours: 4,
    durationLabel: '4 horas',
    minAge: 4,
    maxParticipants: 16,
    difficulty: 'iniciante',
    distanceKm: 3,
    elevationGainM: 80,
    location: 'Teresópolis, RJ',
    region: 'Serra dos Órgãos',
    pricePerPerson: 180,
    priceChildren: 120,
    currency: 'BRL',
    includes: ['Guia pedagógico especializado','Kit explorador (lupa, manual, stickers)','Lanche orgânico','Certificado de Pequeno Explorador','Brinde surpresa'],
    excludes: ['Transporte até o ponto de encontro'],
    whatToBring: ['Tênis fechado','Mochila pequena','Garrafa de água','Roupas confortáveis'],
    cancellationPolicy: 'Cancelamento gratuito até 48h antes.',
    tags: ['kids','educação ambiental','trilha fácil','família','natureza'],
    nextExits: [
      {
        id: 'exit-kids-01',
        experienceId: 'kids-trilha-bicho',
        date: '2026-05-10',
        dateLabel: '10 mai',
        spotsTotal: 16,
        spotsAvailable: 0,
        status: 'sold_out',
        meetingPoints: [
          { id: 'mp-kids-01-a', name: 'Entrada do Parque — Teresópolis', address: 'Rua Eurico Tamborini, 143 — Alto, Teresópolis/RJ', time: '08:30', toleranceMinutes: 10, lat: -22.4118, lng: -42.9825 },
        ],
      },
      {
        id: 'exit-kids-02',
        experienceId: 'kids-trilha-bicho',
        date: '2026-05-24',
        dateLabel: '24 mai',
        spotsTotal: 16,
        spotsAvailable: 9,
        status: 'active',
        meetingPoints: [
          { id: 'mp-kids-02-a', name: 'Entrada do Parque — Teresópolis', address: 'Rua Eurico Tamborini, 143 — Alto, Teresópolis/RJ', time: '08:30', toleranceMinutes: 10, lat: -22.4118, lng: -42.9825 },
        ],
      },
    ],
    highlights: ['Manual de campo exclusivo','Certificado de Pequeno Explorador','Trilha 100% segura e adequada'],
    isNew: true,
    isFeatured: true,
  },

  {
    id: 'festival-astronomia',
    slug: 'festival-astronomia-chapada',
    category: 'event',
    status: 'active',
    title: 'Festival de Astronomia — Chapada',
    subtitle: 'Duas noites sob o céu mais limpo do Brasil',
    description: 'Evento único com astrônomos amadores e profissionais, telescópios de alta resolução, fogueira, música ao vivo e contemplação do Milky Way na Chapada Diamantina.',
    coverImage: 'assets/img/exp-astro-cover.jpg',
    gallery: [
      'assets/img/exp-astro-1.jpg',
      'assets/img/exp-astro-2.jpg',
      'assets/img/exp-astro-3.jpg',
    ],
    durationHours: 48,
    durationLabel: '2 dias / 1 noite',
    minAge: 10,
    maxParticipants: 30,
    difficulty: 'iniciante',
    distanceKm: null,
    elevationGainM: null,
    location: 'Mucugê, BA',
    region: 'Chapada Diamantina',
    pricePerPerson: 1290,
    priceChildren: 790,
    currency: 'BRL',
    includes: ['Hospedagem em glamping (1 noite)','Jantar gourmet sob as estrelas','Acesso a 8 telescópios','Palestra com astrônomo','Café da manhã','Trilha diurna de apoio'],
    excludes: ['Transporte até Mucugê','Bebidas alcoólicas','Equipamento fotográfico'],
    whatToBring: ['Agasalho (pode esfriar à noite)','Câmera fotográfica','Documento de identidade'],
    cancellationPolicy: 'Cancelamento gratuito até 15 dias antes.',
    tags: ['astronomia','festival','noite','estrelas','glamping'],
    nextExits: [
      {
        id: 'exit-astro-01',
        experienceId: 'festival-astronomia',
        date: '2026-06-20',
        dateLabel: '20–21 jun',
        spotsTotal: 30,
        spotsAvailable: 11,
        status: 'active',
        meetingPoints: [
          { id: 'mp-astro-01-a', name: 'Praça 9 de Julho — Mucugê Centro', address: 'Praça 9 de Julho, s/n — Centro, Mucugê/BA', time: '16:00', toleranceMinutes: 20, lat: -13.0020, lng: -41.3760 },
        ],
      },
    ],
    highlights: ['Céu de nível SQI 22.4','Jantar gourmet ao relento','Astrônomo profissional ao vivo'],
    isNew: false,
    isFeatured: true,
  },

  {
    id: 'canoagem-rio-verde',
    slug: 'canoagem-rio-verde',
    category: 'day-experience',
    status: 'active',
    title: 'Canoagem Rio Verde',
    subtitle: 'Descida de canoagem em rio de corredeiras classe II',
    description: 'Descida de 6km pelo Rio Verde em canoas bipessoais com guias de segurança, passando por corredeiras, remansos e matas ciliares intactas. Nenhuma experiência prévia necessária.',
    coverImage: 'assets/img/exp-canoa-cover.jpg',
    gallery: [
      'assets/img/exp-canoa-1.jpg',
      'assets/img/exp-canoa-2.jpg',
    ],
    durationHours: 6,
    durationLabel: '6 horas',
    minAge: 10,
    maxParticipants: 14,
    difficulty: 'moderado',
    distanceKm: 6,
    elevationGainM: null,
    location: 'Brotas, SP',
    region: 'Interior Paulista',
    pricePerPerson: 320,
    priceChildren: null,
    currency: 'BRL',
    includes: ['Canoa e remos','Colete salva-vidas e capacete','Instrutor de segurança na água','Almoço pós-descida','Fotos da descida em alta resolução'],
    excludes: ['Transporte para Brotas','Roupas extras (levar bermuda para molhar)'],
    whatToBring: ['Roupa de banho','Camiseta para molhar','Sandália fechada ou tênis velho','Protetor solar resistente à água'],
    cancellationPolicy: 'Cancelamento gratuito até 48h antes.',
    tags: ['canoagem','rio','adrenalina','água','família'],
    nextExits: [
      {
        id: 'exit-canoa-01',
        experienceId: 'canoagem-rio-verde',
        date: '2026-05-11',
        dateLabel: '11 mai',
        spotsTotal: 14,
        spotsAvailable: 6,
        status: 'active',
        meetingPoints: [
          { id: 'mp-canoa-01-a', name: 'Base Anauá — Brotas', address: 'Estrada Municipal BRT-070 km 3 — Brotas/SP', time: '08:00', toleranceMinutes: 10, lat: -22.2769, lng: -48.1271 },
        ],
      },
    ],
    highlights: ['Corredeiras classe II sem experiência prévia','Fotos em alta resolução inclusas','Rio crystal-clear'],
    isNew: false,
    isFeatured: false,
  },

  {
    id: 'retiro-yoga-selva',
    slug: 'retiro-yoga-na-selva',
    category: 'expedition',
    status: 'active',
    title: 'Retiro Yoga na Selva',
    subtitle: '3 dias de reconexão, silêncio e Mata Atlântica',
    description: 'Retiro de bem-estar em fazenda dentro de reserva privada de Mata Atlântica. Yoga ao amanhecer na varanda sobre o vale, meditação guiada, culinária funcional e trilhas de floresta.',
    coverImage: 'assets/img/exp-yoga-cover.jpg',
    gallery: [
      'assets/img/exp-yoga-1.jpg',
      'assets/img/exp-yoga-2.jpg',
      'assets/img/exp-yoga-3.jpg',
    ],
    durationHours: 72,
    durationLabel: '3 dias / 2 noites',
    minAge: 16,
    maxParticipants: 10,
    difficulty: 'iniciante',
    distanceKm: null,
    elevationGainM: null,
    location: 'Visconde de Mauá, RJ',
    region: 'Serra da Mantiqueira',
    pricePerPerson: 2190,
    priceChildren: null,
    currency: 'BRL',
    includes: ['2 noites em chalé privativo','Todas as refeições (culinária funcional)','Yoga e meditação 2× por dia','Trilha guiada','Sessão de Watsu (banheira natural)'],
    excludes: ['Transporte até Visconde de Mauá','Tratamentos extras no spa'],
    whatToBring: ['Roupas confortáveis','Mat de yoga (ou solicite o nosso)','Diário'],
    cancellationPolicy: 'Cancelamento gratuito até 21 dias antes.',
    tags: ['yoga','retiro','bem-estar','silêncio','floresta','mindfulness'],
    nextExits: [
      {
        id: 'exit-yoga-01',
        experienceId: 'retiro-yoga-selva',
        date: '2026-06-05',
        dateLabel: '5–7 jun',
        spotsTotal: 10,
        spotsAvailable: 5,
        status: 'active',
        meetingPoints: [
          { id: 'mp-yoga-01-a', name: 'Fazenda Alma Verde — Portão', address: 'Estrada da Fazenda Verde, km 2 — Visconde de Mauá/RJ', time: '15:00', toleranceMinutes: 30, lat: -22.3553, lng: -44.5280 },
        ],
      },
    ],
    highlights: ['Chalé privativo com vista para a mata','Yoga sobre o vale ao amanhecer','Watsu em banheira natural'],
    isNew: true,
    isFeatured: false,
  },
];

/** @type {Array<import('./types').Testimonial>} */
export const TESTIMONIALS = [
  { id: 't1', authorName: 'Maria Clara T.', authorRole: 'Designer, São Paulo', avatarInitials: 'MC', rating: 5, text: 'A expedição ao Pantanal mudou minha perspectiva de vida. A organização foi impecável do início ao fim. Ver uma onça-pintada de 6 metros de distância é algo que não tem preço.', experienceId: 'expedicao-pantanal', createdAt: '2026-03-15' },
  { id: 't2', authorName: 'Pedro Henrique', authorRole: 'Empresário, Belo Horizonte', avatarInitials: 'PH', rating: 5, text: 'Levei minha filha de 8 anos no Kids Trilha dos Bichos. Ela não para de falar no certificado de Pequeno Exploradora. Experiência linda, equipe incrível.', experienceId: 'kids-trilha-bicho', createdAt: '2026-04-02' },
  { id: 't3', authorName: 'Juliana Bispo', authorRole: 'Professora, Rio de Janeiro', avatarInitials: 'JB', rating: 5, text: 'O retiro de yoga foi um reset completo. A culinária funcional, o Watsu na banheira natural, o silence… só falta mais dias disponíveis na agenda!', experienceId: 'retiro-yoga-selva', createdAt: '2026-04-18' },
];

/** @type {import('./types').CompanyStats} */
export const STATS = {
  experiencesCount: 32,
  satisfactionPct: 98,
  participantsCount: 4700,
  yearsActive: 8,
};

/** @type {Array<import('./types').TeamMember>} */
export const TEAM = [
  { id: 'tm1', name: 'Camila Nogueira', role: 'Fundadora & Guia Sênior', bio: 'Bióloga e guia de montanha com 15 anos de experiência em expedições pela América do Sul.', avatarInitials: 'CN' },
  { id: 'tm2', name: 'Rafael Matos', role: 'Guia Naturalista', bio: 'Zoólogo especializado em fauna do cerrado e pantanal. Criador do programa de observação de onças.', avatarInitials: 'RM' },
  { id: 'tm3', name: 'Ana Beatriz Souza', role: 'Guia Pedagógica Kids', bio: 'Pedagoga e amante da natureza. Responsável por criar todas as atividades do programa Kids.', avatarInitials: 'AB' },
];

export const CATEGORIES = [
  { id: 'all',          label: 'Todas',       icon: '🌿' },
  { id: 'day-experience', label: 'Experiências de 1 dia', icon: '☀️' },
  { id: 'expedition',   label: 'Expedições',  icon: '🗺️' },
  { id: 'event',        label: 'Eventos',     icon: '✨' },
  { id: 'kids',         label: 'Kids',        icon: '🌱' },
];

export const DIFFICULTY_LABELS = {
  iniciante: 'Iniciante',
  moderado:  'Moderado',
  aventura:  'Aventura',
};

/**
 * Retorna a próxima saída ativa de uma experiência.
 * @param {import('./types').Experience} exp
 * @returns {import('./types').Exit|null}
 */
export function getNextActiveExit(exp) {
  return exp.nextExits.find(e => e.status === 'active' && e.spotsAvailable > 0) ?? null;
}

/**
 * Formata preço em BRL.
 * @param {number} value
 * @returns {string}
 */
export function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(value);
}

/**
 * Formata data ISO para exibição (ex: "17 de mai. de 2026").
 * @param {string} iso
 * @returns {string}
 */
export function formatDate(iso) {
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso + 'T12:00:00'));
}
