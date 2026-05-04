# Anauá Ecoturismo — Site Público

Frontend do site institucional e de reservas da **Anauá Ecoturismo**, empresa especializada em experiências de natureza guiadas na região da Chapada dos Veadeiros.

---

## Estrutura de páginas

| Arquivo             | Descrição                                          |
| ------------------- | -------------------------------------------------- |
| `index.html`        | Home — hero, experiências em destaque, depoimentos |
| `experiencias.html` | Listagem com filtros e paginação                   |
| `experiencia.html`  | Detalhe da experiência, galeria, reserva           |
| `sobre.html`        | Sobre a empresa, valores, equipe                   |
| `contato.html`      | Formulário de contato, FAQ                         |
| `privacidade.html`  | Política de Privacidade (LGPD)                     |
| `termos.html`       | Termos de Uso                                      |
| `cliente.html`      | Área do cliente — login + dashboard de reservas    |

---

## Organização de arquivos

```
anaua/
├── index.html
├── experiencias.html
├── experiencia.html
├── sobre.html
├── contato.html
├── privacidade.html
├── termos.html
├── cliente.html
└── assets/
    ├── css/
    │   ├── tokens.css        ← Design tokens (cores, tipografia, espaçamento)
    │   ├── base.css          ← Reset, utilidades, animações
    │   ├── components.css    ← Componentes reutilizáveis (header, cards, modais…)
    │   ├── home.css
    │   ├── listing.css
    │   ├── detail.css
    │   ├── sobre.css
    │   ├── contato.css
    │   ├── legal.css
    │   └── cliente.css
    ├── js/
    │   ├── data.js           ← Mock data + helpers
    │   ├── components.js     ← Renderização compartilhada
    │   ├── home.js
    │   ├── listing.js
    │   ├── detail.js
    │   ├── sobre.js
    │   ├── contato.js
    │   └── cliente.js
    └── img/
        ├── favicon.svg
        └── placeholder.svg
```

---

## Decisões técnicas

- **Sem framework, sem build step** — HTML + CSS + JavaScript ES Modules puros.
- **CSS Custom Properties** para todo o sistema de design (tokens em `tokens.css`).
- **Google Fonts** via `@import` no `base.css` (Playfair Display + Inter).
- **Mobile-first** — breakpoints somente para expandir layouts em telas maiores.
- **Acessibilidade** — `aria-label`, `aria-expanded`, `role="alert"` em formulários, foco gerenciado em modais.
- **Sem dependências externas** — sem bibliotecas UI, sem Tailwind, sem Redux.
- **Mock data** em `data.js` — pronto para substituição por API REST ou Firebase RTDB.

---

## Como executar localmente

```bash
# Python
python3 -m http.server 5500

# Node
npx serve .
```

Ou use a extensão **Live Server** do VS Code.

---

## Credenciais de demonstração (Área do Cliente)

| E-mail              | Senha      |
| ------------------- | ---------- |
| `demo@anaua.com.br` | `12345678` |
| `test@test.com`     | `password` |

---

## Próximos passos

- [ ] Substituir `data.js` por Firebase RTDB / Firestore
- [ ] Integrar gateway de pagamento (Stripe ou Pagar.me)
- [ ] Autenticação real via Firebase Auth
- [ ] Painel administrativo (saídas, clientes, relatórios)
