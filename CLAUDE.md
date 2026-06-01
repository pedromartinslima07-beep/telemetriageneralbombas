# CLAUDE.md — Convenções do projeto

Notas curtas pra quem (Claude ou humano) está mexendo neste repo. Não duplica
documentação que já existe no código; só registra **pegadinhas que custaram
tempo** e regras que não dá pra inferir lendo só o arquivo.

---

## 📋 Instruções do Projeto (fluxo de trabalho obrigatório)

### Antes de qualquer alteração

1. Leia todos os arquivos da pasta `memory-bank/`.
2. Leia todos os arquivos da pasta `docs/`.
3. Entenda o contexto antes de modificar código.

### Sempre que criar ou alterar uma funcionalidade

1. Atualize a documentação técnica (`docs/`).
2. Atualize o roadmap (`memory-bank/roadmap.md`).
3. Atualize o banco de dados documentado (`docs/banco-de-dados.md`).
4. Atualize o changelog (`docs/changelog.md`).
5. Atualize `memory-bank/current-state.md`.
6. Atualize `memory-bank/active-work.md` caso necessário.

### Regras invioláveis

- **Nunca remova funcionalidades sem autorização explícita.**
- **Sempre priorize consistência com a arquitetura existente.**

### Formato da documentação (vault Obsidian + GitHub)

`docs/` e `memory-bank/` são lidos **tanto no GitHub quanto como vault do
Obsidian** ("segundo cérebro"). Toda doc nova/editada deve seguir estas regras
para não quebrar nenhum dos dois:

1. **Frontmatter YAML** no topo de todo `.md` de doc, com `tags` e `aliases`:
   ```yaml
   ---
   tags:
     - projeto
     - <categoria>      # contexto/* · doc/* · fluxo · moc
   aliases:
     - <nomes alternativos para o Quick Switcher>
   ---
   ```
   Categorias em uso: `contexto/*` (memory-bank), `doc/*` (docs técnicos),
   `fluxo` (docs/modulos), `moc` (índices/Home).

2. **Links sempre em markdown relativo** — `[texto](../pasta/arquivo.md)`.
   Funcionam no GitHub **e** alimentam grafo/backlinks do Obsidian.
   - **Nunca usar wikilinks `[[ ]]`** (o GitHub mostra como texto cru).
   - **Nunca linkar para pasta** (`](docs/)`, `](memory-bank/)`) — o Obsidian
     cria uma nota vazia ao clicar. Aponte para um arquivo real (ex.: o
     `README.md`/índice da pasta).
   - **Referência cruzada entre docs = link de verdade**, não código em crase
     (`` `arquivo.md` `` não vira link no Obsidian). Crase só para nomes de
     arquivo-fonte que não são notas (`src/...js`, `schema.sql`, etc.).

3. **Ligue notas novas ao grafo** — toda doc nova entra como link na
   [`Home.md`](Home.md) (MOC) e, quando fizer sentido, nas notas relacionadas.
   Nada de nota órfã.

4. **Cuidado com `#` virando tag** — hex de cor, headers de exemplo e afins
   devem ficar em crase (`` `#f0b014` ``) para o Obsidian não os ler como tag.

5. **Divisão de papéis** (não duplicar conteúdo entre eles):
   - `memory-bank/decisions.md` = **o "porquê"** (decisões, descartados, lições).
   - `memory-bank/{projectbrief,current-state,active-work,roadmap}.md` = contexto/direção.
   - `docs/` = **o "o quê"/"como"** (banco, API, arquitetura, changelog) + `docs/modulos/` (fluxos).

---

## ⚠️ Cache em 3 camadas — sempre invalide ao mexer no admin

Este é o bug mais comum do projeto. Sintoma clássico: você mexe em
`public/admin.js` ou `public/admin.css`, dá deploy/restart, mas o usuário
ainda vê o comportamento antigo. **Ctrl+Shift+R mostra a versão nova; F5
volta pra antiga.**

Existem **3 camadas de cache** que precisam ser sincronizadas:

### 1. Browser HTTP cache (`?v=N` no `<link>` / `<script>`)

Em `public/admin.html`, os assets têm cache-bust por query string:

```html
<link rel="stylesheet" href="/static/admin.css?v=18">
<script src="/static/admin.js?v=18" defer></script>
<script src="/static/register-sw.js?v=16" defer></script>
```

**Regra:** ao mexer em `admin.js` ou `admin.css`, **bumpe `?v=N`** dos dois.
Ao mexer no `sw.js` (item 3 abaixo), bumpe o `?v=N` do `register-sw.js`.

### 2. Service Worker — lista de paths "network first" (`public/sw.js`)

O SW intercepta TODAS as requests `GET`. Por padrão cai em **cache first**.
Para endpoints da API, isso significa servir dados antigos.

Tem uma lista (no handler `fetch`, busque por `isHtml ||`) com os prefixos
que devem ser **network first**. **Ao criar endpoint novo no backend**
(`/tecnicos`, `/ordens-servico`, etc.), adicione o prefixo nessa lista
**E bumpe o `CACHE_NAME`** no topo do `sw.js` E o `?v=N` do `register-sw.js`
no HTML.

Sem isso, F5 serve `GET /seu-endpoint` do cache do SW (antigo) e a UI fica
desatualizada. Ctrl+Shift+R bypassa o SW, por isso confunde no debug.

### 3. HTML cache do navegador

`/login`, `/admin/painel`, `/cliente/painel` agora têm `Cache-Control:
no-cache` via middleware `_htmlNoCache` em `src/app.js`. Não precisa fazer
nada — apenas saiba que está lá. **Não tire** essa header, senão o
bump do `?v=N` no HTML também volta a quebrar.

### Checklist ao alterar admin

- [ ] Mexeu em `admin.js` ou `admin.css`? → bump `?v=N` no `admin.html`
- [ ] Endpoint backend novo? → adicione na lista network-first do `sw.js` + bump `CACHE_NAME` + bump `?v=N` do `register-sw.js`
- [ ] Em caso de dúvida na transição: rota `GET /admin/reset-cache` desregistra o SW e limpa caches.

---

## Stack: HTML/CSS/JS puro

Backend Node/Express + Postgres (Railway). Frontend é HTML/CSS/JS vanilla
servido pelo Express — sem build, sem framework, sem TypeScript. ApexCharts,
Lucide, Chart.js, Leaflet vêm como arquivos locais em `public/static/`.

**Não migrar pra Next/React/Vite** em redesigns. Foi escolha deliberada.

---

## Migrations

Aplicar com `node scripts/migrate.js NNN_nome.sql`. Lê `DATABASE_URL` do
`.env` (atualmente aponta pra Railway prod). Use `IF NOT EXISTS` /
`IF EXISTS` em tudo pra ser idempotente.

**Lição aprendida na Fase 7E:** marcar a fase como "concluída" no plano antes
de confirmar que a migration rodou em produção causa bug silencioso (tabelas
referenciadas no código não existem). Sempre rode `scripts/migrate.js`
imediatamente após mexer no schema, mesmo em dev.

---

## App mobile herda do admin

Tudo em `app/public/` reusa tokens e componentes de `public/admin.css`
(Mission Control). Brand é amber (`--accent: #f0b014`). Nunca criar paleta
paralela — só CSS exclusivo de mobile (`.cli-nav`, `.cli-fab`, etc.).

---

## Padrão de jobs em background

`setTimeout` recursivo (não `setInterval`). Lê config dinâmica via
`config.service.js` a cada tick — permite ajustar intervalo no admin sem
deploy. Exemplos: `src/jobs/offline.job.js`, `gps-cleanup.job.js`,
`leituras-cleanup.job.js`, `chamados-atraso.job.js`.

Toda config dinâmica precisa estar na whitelist `CHAVES` em
`src/services/config.service.js` (com tipo + min/max) pra ser editável via
`PATCH /admin/configuracoes`.
