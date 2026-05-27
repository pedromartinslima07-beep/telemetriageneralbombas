# Plano: Módulo WhatsApp + IA (Assistente de Atendimento)

## Objetivo

Adicionar um assistente de atendimento via WhatsApp ao sistema de telemetria predial.
A IA funciona como **agente de atendimento** — conversa com clientes em linguagem natural
e, quando necessário, consulta dados reais do backend (telemetria, chamados, reservatórios).

**A IA NÃO controla o sistema. Ela interpreta, consulta e sugere. O backend executa.**

---

## Stack adicionada ao projeto atual

| Componente | Escolha |
|---|---|
| Gateway WhatsApp | Evolution API (self-hosted ou cloud) |
| IA | OpenAI `gpt-4o-mini` (function calling) |
| Banco | Postgres existente (Railway) — novas tabelas |
| Backend | Express existente — novas rotas/services |

---

## Arquitetura do fluxo

```
Cliente WhatsApp
      ↓
Evolution API
      ↓  (webhook POST /whatsapp/webhook)
Backend Node.js
      ↓
  [salva mensagem no banco]
  [responde 200 imediatamente — não bloqueia webhook]
      ↓  (background)
ia.service.js
      ↓  (OpenAI function calling)
  IA decide se precisa de dados → chama funções do backend
  IA gera resposta em linguagem natural
      ↓
  backend abre/atualiza chamado
  backend envia resposta via Evolution API
      ↓
Painel Admin (conversa + resumo + urgência + ação tomada)
```

---

## Fluxo de exemplo real

```
Cliente: "a bomba parou, estamos sem água"

IA → chama buscar_telemetria(condominio_id)
Backend → { bomba_ligada: false, nivel_pct: 18 }

IA → responde: "Confirmei: bomba desligada, reservatório em 18%.
              Abrindo chamado de emergência. Há quanto tempo está assim?"

IA → chama abrir_chamado({ urgencia: 'alta', descricao: '...' })
Backend → chamado aberto, equipe notificada
```

---

## Tabelas novas no Postgres

```sql
-- Mapeia número WhatsApp → usuário/condomínio do sistema
CREATE TABLE clientes_whatsapp (
  id            SERIAL PRIMARY KEY,
  telefone      VARCHAR(30) UNIQUE NOT NULL,  -- ex: "5511999998888"
  nome          VARCHAR(255),
  condominio_id INTEGER REFERENCES condominios(id),
  usuario_id    INTEGER REFERENCES usuarios(id),
  criado_em     TIMESTAMPTZ DEFAULT NOW()
);

-- Uma conversa = uma sessão de atendimento
CREATE TABLE conversas_whatsapp (
  id                  SERIAL PRIMARY KEY,
  cliente_whatsapp_id INTEGER REFERENCES clientes_whatsapp(id),
  status              VARCHAR(20) DEFAULT 'aberta',  -- aberta | fechada
  criado_em           TIMESTAMPTZ DEFAULT NOW(),
  fechado_em          TIMESTAMPTZ
);

-- Cada mensagem da conversa (enviada ou recebida)
CREATE TABLE mensagens_whatsapp (
  id                   SERIAL PRIMARY KEY,
  conversa_id          INTEGER REFERENCES conversas_whatsapp(id),
  evolution_message_id VARCHAR(255) UNIQUE,  -- idempotência: ON CONFLICT DO NOTHING
  direcao              VARCHAR(10) NOT NULL,  -- 'entrada' | 'saida'
  conteudo             TEXT,
  tipo                 VARCHAR(30) DEFAULT 'text',  -- text | image | audio | doc
  ia_categoria         VARCHAR(50),   -- resultado da classificação da IA
  ia_urgencia          VARCHAR(20),   -- baixa | media | alta | emergencia
  ia_resumo            TEXT,
  criado_em            TIMESTAMPTZ DEFAULT NOW()
);

-- Chamados de suporte gerados (manualmente ou pela IA)
CREATE TABLE chamados (
  id            SERIAL PRIMARY KEY,
  conversa_id   INTEGER REFERENCES conversas_whatsapp(id),
  condominio_id INTEGER REFERENCES condominios(id),
  status        VARCHAR(20) DEFAULT 'aberto',    -- aberto | em_atendimento | fechado
  prioridade    VARCHAR(20) DEFAULT 'media',     -- baixa | media | alta | emergencia
  titulo        TEXT,
  descricao     TEXT,
  responsavel_id INTEGER REFERENCES usuarios(id),
  criado_em     TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  fechado_em    TIMESTAMPTZ
);
```

**Alteração na tabela existente:**
```sql
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefone VARCHAR(30);
```
Isso permite mapear número WhatsApp → usuário já cadastrado na chegada do webhook.

---

## Rotas novas

```
POST  /whatsapp/webhook          — recebe eventos da Evolution API
GET   /whatsapp/conversas        — lista conversas (admin)
GET   /whatsapp/conversas/:id    — detalhe com mensagens (admin)

GET   /chamados                  — lista chamados (admin)
GET   /chamados/:id              — detalhe do chamado (admin)
PATCH /chamados/:id              — atualiza status/responsável (admin)
```

---

## Estrutura de arquivos novos

```
src/
  routes/
    whatsapp.routes.js    — webhook + rotas de conversa
    chamados.routes.js    — CRUD de chamados
  controllers/
    whatsapp.controller.js  — recebe webhook, salva, dispara background
    chamados.controller.js  — lógica dos chamados
  services/
    ia.service.js           — orquestra OpenAI function calling
    evolution.service.js    — envia mensagens de volta via Evolution API
    chamados.service.js     — abre/atualiza/fecha chamados
```

---

## Detalhes críticos de implementação

### 1. Webhook não pode bloquear (crítico)

A Evolution API espera `200` em ~3s ou reenvia o webhook. Nunca fazer `await openAI()` dentro do handler do webhook.

```js
// whatsapp.controller.js — padrão correto
async function receberWebhook(req, res) {
  res.sendStatus(200);                          // responde imediatamente
  setImmediate(() => processarMensagem(req.body)); // processa em background
}
```

### 2. Idempotência (crítico)

`evolution_message_id` tem constraint `UNIQUE`. O insert usa `ON CONFLICT DO NOTHING`.
Se a Evolution API reenviar o mesmo evento, a mensagem não é duplicada.

### 3. Segurança do webhook

Middleware que valida o `apikey` no header antes de qualquer processamento:
```js
// process.env.EVOLUTION_WEBHOOK_TOKEN deve bater com o configurado na Evolution API
if (req.headers['apikey'] !== process.env.EVOLUTION_WEBHOOK_TOKEN) {
  return res.sendStatus(401);
}
```

### 4. Contexto da conversa para a IA

A cada mensagem nova, o histórico da conversa é passado para a OpenAI no formato `messages[]`.
Isso dá à IA "memória" do atendimento em andamento.

### 5. Function calling (como a IA acessa dados reais)

A OpenAI recebe um array de `tools` que ela pode chamar. Exemplo:

```js
const tools = [
  {
    type: 'function',
    function: {
      name: 'buscar_telemetria',
      description: 'Busca nível do reservatório e status da bomba do condomínio',
      parameters: {
        type: 'object',
        properties: {
          condominio_id: { type: 'integer' }
        },
        required: ['condominio_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'abrir_chamado',
      description: 'Abre um chamado de suporte',
      parameters: {
        type: 'object',
        properties: {
          titulo:    { type: 'string' },
          descricao: { type: 'string' },
          prioridade: { type: 'string', enum: ['baixa', 'media', 'alta', 'emergencia'] }
        },
        required: ['titulo', 'descricao', 'prioridade']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'buscar_chamados_abertos',
      description: 'Lista chamados abertos do condomínio',
      parameters: {
        type: 'object',
        properties: {
          condominio_id: { type: 'integer' }
        },
        required: ['condominio_id']
      }
    }
  }
];
```

### 6. Modelo e custo

Usar `gpt-4o-mini` — suficiente para classificação e atendimento, custo ~20x menor que GPT-4o.
Filtrar mensagens triviais (< 5 palavras, "oi", "ok", "obrigado") antes de chamar a API.

### 7. Tipos de mensagem da Evolution API

O webhook recebe imagem, áudio, documento, localização além de texto.
O handler não pode quebrar nesses casos — salva o tipo mas processa só texto por enquanto.

---

## Sequência de implementação (MVP)

### Fase 1 — Fundação (sem IA ainda)
- [x] Migration SQL: 4 tabelas + `ALTER TABLE usuarios ADD COLUMN telefone` — rodada no Railway
- [x] `POST /whatsapp/webhook`: valida token, salva mensagem, responde 200 — testado e funcionando
- [x] Registrar rotas no `app.js`
- [x] `GET /chamados`, `GET /chamados/:id` e `PATCH /chamados/:id`

### Fase 2 — IA
- [x] `ia.service.js` com function calling (gpt-4o-mini)
- [x] `evolution.service.js` para enviar respostas via Evolution API
- [x] Processamento background na Fase 1 dispara a IA
- [x] IA abre chamados automaticamente
- [x] IA busca condomínio por nome/endereço e vincula cliente automaticamente
- [x] Tom profissional e natural no atendimento

### Fase 3 — Painel admin expandido + redesign do dashboard

**Premissa:** condomínio como entidade central. Cores atuais mantidas. Telemetria continua
funcionando — o painel é expandido e embelezado, não substituído.

#### 3A — Redesign do dashboard ✅ CONCLUÍDO

O layout antigo (tabela com linhas expansíveis) foi substituído por **cards visuais** por condomínio.

**O que foi implementado:**
- Grid de cards por condomínio com barra de nível por reservatório, status da bomba (LIGADA/DESLIG.), badges coloridos (alertas / chamados / conversas WhatsApp)
- Borda do card reflete urgência: verde (ok) → amarelo (alerta) → vermelho (offline)
- Botões de Editar e Inativar no rodapé do card (admin master)
- Drawer lateral com 3 abas ao clicar em "Detalhes":
  - **Telemetria** — nível, bomba, device, alertas + botões Editar/Key/Excluir por reservatório
  - **Chamados** — lista filtrada por condomínio, ações inline (Fechar / Em atendimento)
  - **WhatsApp** — lista de conversas do condomínio com visualização do chat
- Seção **Chamados** no menu lateral: tabela completa com filtros e badges de contagem
- Seção **WhatsApp** no menu lateral: tabela de conversas, botão Ver abre o chat no drawer
- Badges de contagem no menu lateral para Chamados e WhatsApp
- Mobile: Chamados no bottom nav com badge; drawer como sheet inferior

**Pendências da 3A — todas concluídas:**
- [x] Gauge ApexCharts radial substituindo a barra de nível simples (no drawer, mantendo barra simples nos cards por performance)
- [x] Polling independente por tipo de dado (telemetria 7s / chamados+WhatsApp 20s)
- [x] Badge pulsante para chamados novos + beep curto apenas para `prioridade=emergencia`

#### 3A.1 — Redesign visual "Mission Control" ✅ CONCLUÍDO

Reestilização premium do painel admin inspirada em Vercel/Linear/Datadog. Stack mantida (HTML/CSS/JS puro), sem migrar pra Next.js.

**O que foi implementado:**
- **Paleta dark premium** com aurora sutil de fundo, glassmorphism leve, glows coloridos por status (amber/cyan/violet/danger)
- **Sidebar colapsável** em dois modos: expandida (240px com texto) ou rail (68px com ícones centralizados + tooltip ao hover)
  - 13 itens organizados em seções (Monitor / Atendimento / Infraestrutura / Gestão)
  - Logo da empresa adapta: `login-logo.png` (expandida) → `logo-menu.png` (rail)
  - Indicador de "Status do sistema" no rodapé com bolinha pulsante
- **Topbar** com hamburger + título dinâmico da seção + busca central estilo Linear + ações (atualizar / offline / notificações) + chip do usuário
- **Cards de métrica** com ícone colorido, valor grande, sparkline ApexCharts em gradiente
- **Mission control grid**:
  - Mapa estilizado de São Paulo (SVG decorativo com malha + contorno + pins pulsantes por status, clicáveis abrindo o drawer)
  - Painel "Alertas Críticos" com top alertas priorizados
  - Feed "Atividade em Tempo Real" combinando alertas + chamados + leituras, com badge LIVE pulsante
- **Linha inferior**:
  - Conversas Recentes (avatar de iniciais)
  - **IA Insights** com ícone de cérebro brilhante, aura roxa pulsante, partículas orbitando, e insights derivados dos dados reais
  - Telemetria em Tempo Real (mini-barras por reservatório)
- **Animações otimizadas**: transição da sidebar usa `will-change` + `contain: layout paint`, conteúdo interno colapsa via `max-width` e `opacity` (compositor-friendly, sem reflow cascateado)
- Seções stub "Em breve" para itens novos do menu (Telemetria avançada, Mapa, Reservatórios, Bombas, Técnicos, Relatórios, IA Insights, Configurações) — permite navegar sem quebrar `showSection()`

**Funcionalidade preservada:**
- Todos os IDs e data-actions originais mantidos — `admin.js` continua populando os mesmos containers
- Drawer, modais, mobile topbar + bottom nav intactos
- Lógica de autenticação, filtros, paginação e cadastros sem alterações

#### 3A.2 — Seção Telemetria avançada ✅ CONCLUÍDO

Substitui o stub "Em breve" da seção Telemetria por uma página completa inspirada em painéis SaaS de monitoramento.

**O que foi implementado:**
- **5 KPIs no topo** (`.resumo-grid` + `.rc` reaproveitados): Reservatórios Monitorados · Nível Médio Geral · Bombas Ativas · Alertas Críticos · Dispositivos Offline
- **Bar chart "Níveis dos Reservatórios"** (ApexCharts) com cor por barra (vermelho <20%, âmbar <40%, ciano <70%, verde >70%) e filtros funcionais de **condomínio** e **tipo**
- **Lista "Reservatórios Críticos"** priorizando offline > nível baixo > alertas, top 12, clicáveis abrindo o drawer
- **Tabela "Status das Bombas"** com pills LIGADA/DESLIGADA, % colorido por faixa, tempo desde a última atualização e badge OFFLINE
- **Line chart "Histórico de Níveis"** (24h/3d/7d) com seleção de **condomínio** + **reservatório** (rótulos: `— Auto: 3 mais críticos —` quando sem filtro). Botão **Exportar PDF** habilita quando há reservatório específico
- Endpoint novo `GET /admin/historico?device_ids=A,B,C&horas=N` (até 10 devices, buckets agregados por hora)
- Rota `/relatorio/pdf` liberada para admin (mantém restrição de condomínio para cliente)

#### 3B — Mapa interativo de condomínios

**Biblioteca:** Leaflet.js (open source, sem API key, ~150kb local) + tiles dark do Carto

**Pinos:** todos os condomínios cadastrados, cor pelo status calculado de chamados abertos + alertas de telemetria + offline.

**Painel lateral:** side-by-side colado ao mapa (não usa o drawer, mantém o contexto visual do mapa).

##### 3B.0 — Schema + IA com classificação ✅ CONCLUÍDO

- Migration `002_mapa_categoria.sql`: `condominios.lat`/`lng` (NUMERIC 9,6) + `chamados.categoria` (enum: `vazamento`, `bomba_falha`, `nivel_baixo`, `sem_agua`, `ruido`, `manutencao`, `outro`)
- Função `abrir_chamado` da IA ganha parâmetro `categoria` (obrigatório, enum)
- System prompt da IA ensina a classificar categoria e prioridade com critérios objetivos
- Endpoints de chamados aceitam e retornam `categoria` (filtro `?categoria=` no GET)
- Bug latente corrigido: GET `/chamados` agora retorna `condominio_id` (fazia os badges dos cards filtrarem sempre 0)
- Script `npm run migrate <arquivo.sql>` para aplicar migrations via Node usando `DATABASE_URL` (substitui depender da UI do Railway)

##### 3B.1 — Cadastro de coordenadas com geocoding híbrido ✅ CONCLUÍDO

- POST/PATCH `/condominios` aceitam e validam `lat`/`lng`; GET retorna ambos
- Endpoint `GET /admin/geocode?q=...` proxy do Nominatim (OpenStreetMap) com User-Agent e fila de 1 req/s respeitando o ToS
- Formulários de cadastro e edição ganham:
  - Campo **CEP** que auto-preenche endereço/bairro/cidade/UF via **ViaCEP** ao completar 8 dígitos (máscara automática)
  - Botão **"Buscar pelo endereço"** que dispara o geocoding; 1 resultado posiciona o pino direto, múltiplos viram lista de sugestões
  - **Mini-mapa Leaflet** (~280px) com pino arrastável; arrastar atualiza os campos lat/lng, e digitar lat/lng move o pino
- Leaflet servido localmente em `public/leaflet.{js,css}` (sem CDN externo); tema dark Carto para os tiles
- Pino customizado via DivIcon (CSS-only, sem depender das imagens default do Leaflet)
- CSP (Helmet) ajustado para permitir tiles do Carto e fetch ao ViaCEP

##### 3B.1.2 — CEP persistido + reverse sempre sobrescreve ✅ CONCLUÍDO

- Migration `003_condominio_cep.sql` adiciona `condominios.cep VARCHAR(8)` (somente dígitos).
- POST/GET/PATCH `/condominios` aceitam, retornam e validam `cep` (8 dígitos ou null).
- Formulários (novo e editar) enviam `cep` no payload; ao abrir o editar, o campo é pré-preenchido com a máscara `12345-678`.
- Removida a heurística de 300m do reverse geocode: ao arrastar o pino, **sempre** sobrescreve endereço/bairro/cidade/UF/CEP com o que o Nominatim retornou (campo vazio do reverse mantém o atual). A pequena chance de o OSM trazer o bairro errado em algumas áreas é compensada pelo controle manual — o usuário ajusta direto se discordar.

##### 3B.1.1 — Refinamentos do geocoding + reverse geocoding ✅ CONCLUÍDO

Caso real que motivou: CEP `05861-270` (Jardim Mônica, SP) — BrasilAPI sem coords, Nominatim retornava 3 ruas homônimas em outros bairros/cidades. O usuário não conseguia posicionar o pino e, ao arrastar, os campos do formulário não acompanhavam.

**Geocoding direto (CEP → coords) mais robusto:**
- **AwesomeAPI** adicionada como 3ª fonte de coordenadas em paralelo com ViaCEP+BrasilAPI no `buscarEnderecoPorCep`. Ordem de preferência: `brasilData.location.coordinates` → `awesomeData.lat/lng` → fallback Nominatim. Cobre os CEPs urbanos que a BrasilAPI v2 deixa sem coords.
- CSP (Helmet) liberado para `https://cep.awesomeapi.com.br`.

**Busca por endereço (`buscarCoordenadasPorEndereco`):**
- Tentativas progressivas: `endereço+CEP` → `endereço` → `CEP+cidade` → `bairro` (busca livre `q=`) → `cidade`. Bairro nunca entra no campo `street` do Nominatim (que aceita só logradouro).
- `_resultadoNaCidade` ficou estrito (sem fallback no `display_name`, que deixava passar "São Paulo" do nome do estado e validava endereços de outras cidades paulistas).
- Novo helper `_resultadoNoCep` — bate prefixo de 5 dígitos do `address.postcode` e descarta resultados que batem negativamente (rua homônima em CEP/bairro errado). Resultados sem postcode são mantidos.
- Quando só o limite administrativo do município é encontrado, mensagem explicita: *"Não achei a rua exata no mapa. Pino colocado no centro de <cidade> — arraste até o endereço correto."*

**Reverse geocoding ao arrastar o pino:**
- Novo endpoint `GET /admin/reverse-geocode?lat=X&lon=Y` — proxy do Nominatim `/reverse` com `zoom=18` e mesma fila de rate limit do `/geocode`.
- Handler `dragend` chama o reverse e popula os campos endereço/bairro/cidade/UF/CEP. `ISO3166-2-lvl4` é tratado pra extrair a UF (`BR-SP` → `SP`).
- Race protection: sequência por prefixo descarta resposta obsoleta se o usuário arrastar várias vezes rápido.
- **Heurística "ajuste fino vs mudança de endereço"** (300m via Haversine): arrastes pequenos mantêm o texto vindo do CEP intacto (porque o OSM em algumas áreas tem o bairro indexado errado — ex: rua do Jardim Mônica aparece como Capão Redondo no reverse); arrastes longos sobrescrevem tudo com o que o Nominatim retornou.

##### 3B.2 — Seção Mapa ✅ CONCLUÍDO

Mapa do dashboard (Mission Control) reescrito como Leaflet real, e nova seção dedicada `data-section="mapa"` no padrão da referência visual `public/front-mapa.png`.

**Dashboard:** o SVG decorativo do `mc-map` foi substituído por um Leaflet (dark Carto) que plota cada condomínio pelas suas coordenadas reais (`condominios.lat`/`lng`). Pinos pulsantes (`mc-pin-leaflet`) coloridos por status — OK / Alerta / Crítico — clique abre o drawer existente. Singleton com `_mcMap` + `_mcMarkers` reusado entre polls (sem recriar o Leaflet a cada atualização).

**Seção Mapa nova:**
- **4 KPIs no topo:** Total / Online / Crítico / Offline (recalculados a cada poll).
- **Grid 60/40:** mapa Leaflet grande à esquerda + painel lateral à direita.
- **Painel lateral** com cabeçalho (nome + endereço completo) e 5 tabs:
  - *Visão Geral* — gauge de nível médio dos reservatórios + 3 stats (Reservatórios / Bombas Ativas / Alertas) + lista resumida de alertas
  - *Reservatórios* — lista por reservatório com nível e status offline
  - *Bombas* — pills LIGADA/DESLIGADA por reservatório + "última leitura há ..."
  - *Alertas* — todos os alertas abertos daquele condomínio
  - *Chamados* — chamados filtrados pelo `condominio_id` (consome `_chamadosData`)
- Clicar num pino seleciona o condomínio e re-renderiza o painel. Botão **"Abrir Painel"** dispara o `abrirDrawer()` existente para o fluxo completo (telemetria histórica, ações de chamado, conversas WhatsApp).
- **Linha inferior, 3 cards:**
  - *Status dos Condomínios* — donut SVG (OK / Alerta / Crítico / Offline)
  - *Distribuição por Zona* — donut SVG com total no centro; zona derivada por quadrante em torno da Praça da Sé (`-23.5505, -46.6333`), raio Centro ≈ 3 km
  - *Últimas Atualizações* — lista combinando alertas abertos + chamados, ordenados por `criado_em` descendente

**Backend:** `GET /admin/status` agora retorna `endereco`, `bairro`, `cidade`, `uf`, `cep`, `lat`, `lng` por condomínio (era só id+nome). Pré-requisito pra plotar e mostrar endereço no painel sem fazer uma chamada extra.

**Sem clusters por enquanto** (decisão consciente — adicionar `leaflet.markercluster` quando o número de condomínios justificar).

##### 3B.3 — Tiles via proxy + otimização do mapa ✅ CONCLUÍDO

Tiles do Carto passavam direto pro cliente, mas adblockers e firewalls corporativos bloqueavam, deixando o mapa em branco pra alguns usuários.

**Solução:** rota nova `GET /tiles/:z/:x/:y.png` proxy o tile do Carto pelo nosso próprio domínio. Como tudo chega do mesmo origin, nada é bloqueado.

**Otimizações no proxy:**
- Rotação de subdomínios `a/b/c/d.basemaps.cartocdn.com` pra paralelismo
- Cache em memória de até 4000 tiles (24h TTL) — depois do primeiro hit por tile, sai instantâneo
- Dedup de requisições inflight (vários clientes pedindo o mesmo tile = 1 fetch upstream)
- `Cache-Control: immutable, max-age=86400` (browser + CDN cacheiam)
- Subdomínios rotacionados na URL upstream
- OSM fallback removido (Carto é estável, OSM oficialmente proíbe proxy em apps)

**Otimizações no cliente Leaflet:**
- `keepBuffer: 4` — mantém tiles ao redor da viewport carregados (arrasto pequeno não baixa nada)
- `updateWhenIdle: false` + `updateInterval: 100` — carrega durante o pan, sensação de fluidez

##### 3B.4 — Polimento da página Mapa ✅ CONCLUÍDO

Três ajustes na seção Mapa após uso real:

**Card "Status dos Condomínios" → "Alertas Recentes":**
- Donut OK/Alerta/Crítico/Offline substituído por lista compacta combinando telemetria aberta + chamados não-fechados
- Cada item: nome do condomínio + tipo do problema + badge Crítico/Alta/Média + tempo relativo
- Click vai pra seção Alertas (ou Chamados, se for um chamado)

**Pinos do mapa redesenhados:**
- Bolinha pulsante substituída por ícone de prédio (SVG branco) sobre quadrado arredondado com cor de status
- Pulse só em warn/bad (chama atenção); ok fica discreto; offline cinza sem pulse
- Hover cresce 15% e fica por cima (útil quando pinos próximos)

**Fix da classificação por zona:**
- A divisão oficial de SP não é simétrica (Zona Sul cobre todo o sudoeste — Capão Redondo, Campo Limpo, M'Boi Mirim — mesmo geograficamente sendo "oeste-sul")
- Quadrante puro lat/lng falhava: Capão Redondo aparecia como Zona Oeste
- `_mpZonaPara` ganhou mapa de ~80 bairros conhecidos de SP → zona oficial (com normalização de acentos)
- Fallback geográfico ajustado: > 8km ao sul = Zona Sul independente da longitude

### 3C — Redesign página /alertas (unificada) ✅ CONCLUÍDO

A página antes era uma tabela simples só de telemetria. Agora "alerta" passa a ser conceito guarda-chuva que cobre **telemetria + chamados**. Banco fica separado (cada origem tem campos próprios), unificação só na UI.

**Layout completo inspirado em mockup (`public/alertas-front.png`):**

- **5 KPIs clicáveis** no topo: Críticos / Atenção / Normais / Resolvidos / Tempo médio pra resolver
- **Toolbar:** 5 tabs com contadores (Todos / Críticos / Atenção / Normais / Resolvidos) + busca + range de data + Limpar
- **Tabela unificada** com 8 colunas: ID (`TEL-X` ou `CH-X`), Condomínio + badge de origem, Tipo, Severidade, Data, Tempo aberto, Status, Ações
- **Painel lateral de detalhes** abre ao clicar numa linha:
  - **Telemetria:** mini-gauge SVG do reservatório + dados (nome, altura, tipo) + **histórico de nível 24h** via `/admin/historico`
  - **Chamado:** categoria, prioridade, responsável, dados do cliente WhatsApp
  - Linha do tempo (criado em / tempo aberto ou resolvido em)
- **Paginação** + seletor 10/25/50 por página
- Botão "Marcar como resolvido" chama o endpoint certo por origem (PATCH `/alertas/:id/fechar` ou PATCH `/chamados/:id`)

**Modelo de dados normalizado** (`_alUnificar()`):
```js
{ key: 'TEL-123' | 'CH-45', origem, rawId, raw, titulo, descricao,
  condominio_id, condominio_nome, device_id, severidade, status,
  criado_em, fechado_em }
```

Mapeamento de severidade:
- Telemetria: `dispositivo_offline`/`nivel_muito_baixo` → crítico, `nivel_baixo` → atenção, resto → normal
- Chamado: `emergencia` → crítico, `alta` → atenção, `media`/`baixa` → normal

### 3D — Ações recomendadas + Análise IA + Comentários (alertas) ✅ CONCLUÍDO

Continuação da página /alertas — 3 features extra no painel lateral.

**Ações recomendadas (fixas, hardcoded por tipo):**
- Aparecem instantâneo, sem custo de IA
- Por tipo de alerta de telemetria (`dispositivo_offline` / `nivel_muito_baixo` / `nivel_baixo`) ou por prioridade do chamado (`emergencia` / `alta` / `media` / `baixa`)
- Lista de 3-5 ações por tipo (ex: "Verificar bomba", "Acionar manutenção urgente")

**Análise IA sob demanda:**
- Botão "✨ Pedir análise da IA" — quando clicado, chama `POST /alertas/analisar-ia` que monta contexto (tipo, reservatório, altura, condomínio, endereço) e chama `gpt-4o-mini` com `response_format: json_object`
- Resposta tem forma `{ analise: string, acoes: string[] }`
- UI: card roxo com gradient mostrando análise + ações + botão "Refazer análise"
- Cache na sessão (Map em memória) — reabrir o painel não dispara nova chamada

**Comentários nos alertas:**
- Migration `004_alerta_comentarios.sql`: tabela `alerta_comentarios` com `alerta_origem` ('telemetria'|'chamado') + `alerta_id` (sem FK porque cobre 2 origens) + autor + texto + data
- Endpoints `GET /alertas/comentarios/:origem/:id` e `POST /alertas/comentarios`
- UI: lista cronológica + textarea (Enter envia, Shift+Enter quebra linha, max 2000 chars)
- Autor mostrado a partir do `usuarios.nome` via JOIN

**Bug correlato corrigido:** `_alResolver` chamava `POST /alertas/:id/fechar` mas a rota é `PATCH`. Telemetria não conseguia ser fechada pela página /alertas.

### 3E — Polimento da animação da sidebar ✅ CONCLUÍDO

Reclamação que a animação de expandir/colapsar a sidebar "não estava lisa". Diagnóstico mostrou 3 problemas:

1. **Texto dos itens snap-out**: `opacity` no `.nav-item-label` mudava instantâneo (não estava no `transition`), só `max-width` animava — texto "estalava" pra invisível enquanto a largura ainda animava.
2. **Logos da marca pulando**: full → mini usava `display: none/block`, sem transição. Solução: ambas as imagens em `position: absolute` sobrepostas no `.sidebar-brand`, com `align-self: stretch` pra herdar a altura do header, e crossfade via opacity.
3. **Durações dessincronizadas**: `.nav-section-label` tinha `opacity .15s` + `max-height .22s` — terminavam em momentos diferentes.

**Solução:** unificou tudo em **280ms com `cubic-bezier(.4, 0, .2, 1)`** (material standard easing), opacity dos sub-elementos animando junto, `will-change` nos labels pra GPU hint.

### 3F — WhatsApp como central de atendimento ✅ FASE A CONCLUÍDA

Página /whatsapp era uma tabela simples de conversas. Virou central de atendimento estilo CRM/inbox, **inspirada em `public/whatsapp-ia.png`**.

**Premissa do redesign** (do briefing do usuário): não é "WhatsApp Web dentro do site". É uma caixa de entrada própria que recebe mensagens da Evolution API e responde via Evolution API. O cliente continua usando o WhatsApp dele normal; quem muda é a empresa (responde pelo painel em vez do celular).

#### Fase A — Visualização + assumir conversa ✅ CONCLUÍDO

**Layout 3 colunas:**

- **Coluna 1 (lista):** busca + 4 tabs com contadores (Todos / Não respondidas / Em atendimento / Resolvidas), cards com avatar (iniciais), nome, condomínio, prévia da última mensagem, hora, indicador de status (bolinha vermelha/amarela/verde no avatar), badge 👤 se assumida por humano.

- **Coluna 2 (chat):** cabeçalho com avatar + nome + telefone + condomínio + botão "Assumir/Devolver", corpo com bubbles tipo WhatsApp (entrada esquerda neutra, saída direita verde), separadores de data, cards roxos especiais quando mensagem tem `ia_resumo` (mostra resumo + badges de categoria/urgência), input desabilitado (Fase B vai habilitar).

- **Coluna 3 (info):** Contato (nome, telefone), Condomínio (com endereço), Ações rápidas (sempre visíveis agora):
  - Com condomínio vinculado: "Ver telemetria" (navega pra Mapa + seleciona o condo) + "Abrir chamado"
  - Sem vínculo: "🔗 Vincular a um condomínio" (prompt com lista numerada) + "Abrir chamado sem condomínio"
  - Histórico dos últimos 5 chamados do condomínio

**Classificação dinâmica de status** (sem mexer no schema):
- `status = 'fechada'` → resolvida
- `assumida_por_id != NULL` → em atendimento (humano controlando)
- `aberta` + última saída → em atendimento (IA respondeu)
- `aberta` + última entrada / sem msg → não respondida

**Polling rápido (5s)** só pra mensagens da conversa selecionada (independente do polling de 20s da lista geral).

**Assumir conversa (IA cala):**
- Migration `005_conversas_assumida.sql`: `conversas_whatsapp.assumida_por_id` (FK `usuarios`) + `assumida_em` (timestamptz)
- Endpoints: `PATCH /whatsapp/conversas/:id/assumir` e `/devolver-ia`
- No `whatsapp.controller.js`, antes de chamar `processarComIA`, checa `assumida_por_id` — se setado, **a IA não responde** (mas a mensagem do cliente continua sendo salva)
- UI: botão "✋ Assumir conversa" / "↩ Devolver à IA" no cabeçalho do chat, subtítulo mostra "Assumida por [nome]" em laranja
- Endpoint extra `PATCH /whatsapp/conversas/:id/vincular-condominio` pra vincular cliente sem condomínio direto da interface

#### Fase B — Envio de mensagens ✅ CONCLUÍDO
- Habilitar o input da coluna 2
- Endpoint `POST /whatsapp/conversas/:id/responder` que chama `evolution.service.enviarMensagem`
- Salvar a mensagem enviada como `direcao = 'saida'` (e marcar como humana, não-IA)
- Auto-assumir a conversa quando o atendente digita

#### Fase C — IA assistiva ✅ CONCLUÍDO
- Botão "Resumir conversa" → chamada IA sob demanda mostrando resumo no painel direito
- Botão "Sugerir resposta" → IA propõe texto que o atendente pode revisar e enviar; "Usar essa resposta" cola no input

#### Fase D — Refinamentos ✅ CONCLUÍDO
- Status da conversa expandido (`em_atendimento` no banco) + migração de dados existentes
- Mensagens não-lidas (badge vermelho com contagem, some ao abrir a conversa)
- Display rich de áudio/imagem/documento (cards visuais com ícone por tipo)
- WebSocket adiado conscientemente — polling de 5s suficiente para o volume atual

### Fase 4 — Integração telemetria automática ✅ CONCLUÍDO
- [x] Ao abrir chamado, anexa última leitura do condomínio automaticamente
- [x] Alerta de telemetria crítico → IA abre chamado + notifica cliente via WhatsApp automaticamente

### Fase 5 — Polimento e gestão de conversas ✅ CONCLUÍDO

#### Correções de bugs
- `whatsapp.controller.js`: busca de conversa existente agora inclui `status = 'em_atendimento'` — evitava criar conversa duplicada quando o cliente respondia com a conversa assumida por humano
- CSS: definição duplicada de `.wa-conv-unread` mesclada em uma só
- Polling 5s: agora também atualiza o painel direito quando metadados mudam (`condominio_id`, `assumida_por_id`, `status`), preservando resultado da IA já exibido

#### Vincular condomínio — sem prompt()
- Substituído `window.prompt()` (bloqueado silenciosamente em alguns browsers) por select inline no próprio painel direito
- Botão "Vincular" expande para `<select>` + "Confirmar" / "Cancelar" sem sair do painel

#### Apagar conversa
- Rota `DELETE /whatsapp/conversas/:id` — remove conversa e mensagens (CASCADE), desvincula chamados (SET NULL)
- Botão de lixeira no cabeçalho do chat com confirmação explícita

#### Fechar / Reabrir conversa
- Rotas `PATCH /whatsapp/conversas/:id/fechar` e `/reabrir`
- Botão **"✓ Fechar"** (verde) no cabeçalho — encerra o atendimento, IA para de responder, input some, banner de encerramento aparece no rodapé do chat com a data
- Botão **"↺ Reabrir"** aparece no lugar para reverter
- Botão "Assumir/Devolver" desaparece em conversas fechadas

#### Botão "Ver telemetria do condomínio"
- Antes navegava diretamente para a seção Telemetria; agora abre o drawer lateral (aba Telemetria) do condomínio
- Dentro do drawer, botão **"📊 Ver telemetria completa"** fecha o drawer, navega para a seção Telemetria e aplica o filtro do condomínio automaticamente

### Fase 6 — Hardening de segurança e configurações dinâmicas ✅ CONCLUÍDO

Auditoria de segurança ampla cobrindo envs obrigatórias em produção, role-based access mais granular, e migração de constantes hardcoded para configuração dinâmica editável pelo master admin.

#### 6A — Envs obrigatórias em produção ✅

Em `NODE_ENV=production`, o servidor faz `process.exit(1)` no boot se faltar:
- `JWT_SECRET` (antes tinha fallback `dev-secret-local-apenas`)
- `CORS_ORIGINS` (antes caía em `localhost:3001`)
- `EVOLUTION_WEBHOOK_TOKEN` (antes o webhook aceitava qualquer payload)

`OTP_DISABLED=true` é **ignorado em produção** (2FA sempre obrigatório). Em dev, todos os fallbacks continuam funcionando — desenvolvimento local não muda.

#### 6B — Página Relatórios → aba Insights ✅

Substituiu a página stub "IA Insights" do menu. Removida da sidebar; botão "Ver análise completa →" do Mission Control passou a apontar pra **Relatórios → aba Insights** via `data-rel-tab-go="insights"`.

**Novo endpoint** `GET /relatorios/insights` retorna 3 blocos (top condomínios problemáticos, categorias mais comuns no WhatsApp, totais agregados). SQL puro, filtros `data_ini/data_fim/condominio_id`. Bug latente corrigido: `conversas_whatsapp` não tem `condominio_id` direto — joinado via `clientes_whatsapp`.

**2 widgets na UI:**
- Tabela "Top 5 condomínios" com score = chamados_abertos×3 + alertas_ativos×2 + total
- Donut "Categorias mais comuns no WhatsApp" usando `mensagens_whatsapp.ia_categoria`

#### 6C — Centralização e polimento dos Relatórios ✅

**Centralização** (antes cada aba duplicava boilerplate):
- `_relFetch({ endpoint, btnAction, ids })` — substitui fetch+botão+erro nas 4 funções `gerarRel*`
- `_relFmtData()`, `_relFmtTipo()`, `_relTipoClasse()`, `_relCategoriaLabel()`, `_relCount()` — formatadores compartilhados
- `_REL_TABS` mapa — substitui o switch ternário triplo do `_relMostrarTab`

**Tabelas consertadas:**
- Chamados: ID virou `CH-3`, coluna **Categoria** adicionada (estava no CSV mas faltava na tabela)
- Alertas: ID virou `TEL-7`, coluna **Condomínio** adicionada, tipo ganhou badge colorido
- Telemetria: coluna Dia em pt-BR (antes ISO `2026-05-19`)
- Texto "registros" consistente em todas (Telemetria antes dizia "linhas")

**Polimento UX:**
- Tabs do topo com padding correto (antes coladas na borda inferior do card)
- Gráfico "Nível médio por reservatório" trocado de horizontal pra vertical (bug do `yaxis.formatter` em horizontal aplicando "%" nos nomes)
- Body da aba sempre visível ao trocar de tab (antes ficava em branco durante o fetch)
- `setTimeout(60)` antes do render ApexCharts → `requestAnimationFrame` (~16ms vs 60ms)

#### 6D — Página Configurações completa ✅

Substituiu stub "Em breve" por layout com 5 tabs no padrão visual de Relatórios.

**Nova infraestrutura:**
- Migration `010_configuracoes.sql`: tabela key-value `configuracoes` com seeds idempotentes
- `src/services/config.service.js`: helpers `getConfig/getConfigBool/getConfigInt/setConfig` com cache em memória (TTL 30s), whitelist de chaves + validação de tipo
- `ia.service.js` lê `ia.enabled`, `ia.modelo`, `ia.system_prompt` da config; retorna `null` quando desabilitada (não chama OpenAI)
- `offline.job.js` lê `jobs.offline_intervalo_min` a cada tick (setInterval virou setTimeout recursivo); expõe `getOfflineJobStatus()`
- `evolution.service.js` ganhou `checarStatusConexao()` (GET `/instance/connectionState/`)

**Novos endpoints:**
- `POST /auth/trocar-senha`
- `GET /auth/dispositivos`, `DELETE /auth/dispositivos/:id`, `DELETE /auth/dispositivos`
- `GET /admin/configuracoes`, `PATCH /admin/configuracoes` (master admin)
- `POST /admin/usuarios/:id/reset-senha` — gera senha temporária aleatória, revoga trusted devices (master admin)
- `DELETE /admin/usuarios/:id` (master admin, bloqueia auto-remoção)
- `PATCH /admin/usuarios/:id` — agora atualiza nome/email/role/condomínio (antes era placeholder vazio)
- `GET /admin/integracoes/status` — 5 cards: WhatsApp Evolution (ping real), OpenAI, Resend, Postgres (latência), Job offline

**5 abas em Configurações:**

| Aba | Quem vê | Conteúdo |
|---|---|---|
| Conta | todos | Trocar senha + lista trusted devices (marca "Este" no atual) + Sair de todos |
| Usuários | master | Tabela CRUD + modal de criar/editar + reset senha (mostra senha temp uma vez) + remover |
| IA | master | Toggle on/off + select modelo (mini/4o) + textarea system prompt + Restaurar padrão |
| Notificações | master | Email destinatário + intervalo do job offline (1-60 min) |
| Integrações | master | 5 cards de status com badge ok/warn/bad + botão "Testar conexões" |

Modal exclusivo da seção (`#cfgModalOverlay`) pra não conflitar com o overlay global.

#### 6E — Email de alerta crítico ✅

Resend já era usado pra OTP; agora também dispara email automático quando alerta novo é criado:

- `sendAlertaEmail(dados)` em `email.js` lê config `alertas.email_destinatario`
- Anti-spam: dispara só quando `upsertAlertaAberto` retorna `action: "inserted"` (alerta novo). 1 alerta = 1 email
- 3 origens disparam: `offline.job.js` (dispositivo offline), `telemetria.routes.js` (nivel_baixo e nivel_muito_baixo)
- Template HTML formatado (dark, paleta Mission Control) com tabela Condomínio / Reservatório / Nível / Data + caixa da mensagem
- Silencioso quando config vazia, sem API key, ou destinatários sem email válido (regex)

#### 6F — Refinamento do RBAC (admin_viewer) ✅

**Backend** — rotas de escrita sensíveis migradas de `adminOnly` (admin + viewer) pra `masterAdminOnly` (só admin):
- `POST /admin/usuarios` (era inconsistente — PATCH/DELETE já eram master)
- `PATCH /chamados/:id`
- `POST /tecnicos`, `PATCH /tecnicos/:id`, `DELETE /tecnicos/:id`

**Mantidas em `adminOnly` por decisão (admin_viewer participa):**
- Comentários em alertas (`POST /alertas/comentarios`)
- Disparar job manual (`POST /jobs/verificar-offline`)
- **WhatsApp inteiro** (responder, assumir, devolver, fechar, reabrir, vincular, apagar, sugerir, resumir) — viewer é parte do time de atendimento

**Frontend** — viewer agora vê **as mesmas telas que o master**, só sem botões de escrita:
- Mecanismo: `body.role-viewer` + CSS `body.role-viewer .viewer-only-hide { display: none !important }`
- Seção Cadastros não fica mais oculta — viewer vê a lista de clientes, só não tem botões de criar/editar/inativar
- Botões escondidos: criar/editar/excluir em Cadastros, Técnicos, Reservatórios; mudar status em Chamados; "Marcar como resolvido" em Alertas; aba inteira Usuários/IA/Notificações/Integrações em Configurações
- WhatsApp permanece 100% liberado (acesso total à central de atendimento)

---

### Fase 7 — App mobile nativo (Capacitor) para técnicos e clientes 📋 PLANEJADA

Objetivo: app real no celular (Play Store + App Store) focado em **técnicos** (campo) e **clientes/síndicos** (acompanhamento). O admin continua usado no PC — o app **não substitui** o painel admin, complementa.

**Premissa de stack:** mantém HTML/CSS/JS puro. Usa **Capacitor** (Ionic) pra embrulhar o frontend num app nativo. Mesmo código, dois alvos (`.apk` e `.ipa`). Sem React Native, sem Flutter — preserva a decisão original do projeto.

**Por que não PWA:** o requisito de **rastreamento GPS do técnico em background** mata PWA — iOS Safari só captura localização com aba visível; Android Chrome mata o service worker em minutos. Capacitor expõe APIs nativas de background location com gestão de bateria adequada.

**Premissa visual (regra rígida):** o app **herda 100% do sistema visual do admin web** (Mission Control). Toda nova tela em `app/public/*` deve:
- Usar verbatim os tokens (`:root`) de `public/admin.css` — `--bg`, `--surface`, `--accent` (**amber `#f0b014`**, não cyan/violet), `--ok/warn/danger`, glows, shadows
- Reusar componentes existentes: `.btn` / `.btnAccent` / `.btnDanger`, `.rc` (com variantes `rc-ok/warn/bad/neutral/violet/cyan`), `.card`, `body::before` aurora
- Pra conteúdo idêntico entre admin e app (cards de chamado, badges de prioridade, KPIs), usar **exatamente as mesmas classes**
- Mobile-only patterns (`.app-shell`, `.screen`, bottom nav, full-screen sheet, login form) podem ser novos, mas só com os tokens do admin — **nunca declarar variáveis paralelas**

Antes de criar qualquer estilo no app, `grep` no `admin.css` pelo conceito. Se existe, copia. Se não, cria com os tokens existentes.

#### 7A — Estrutura do app + Capacitor setup ✅ CONCLUÍDO

Commit `066c1a8`: diretório `app/public/` criado com `index.html`, `app.js`, `app.css`. Express serve `/app/*` a partir dessa pasta (em dev). Capacitor (config + sync + Android/iOS) ainda **não inicializado** — fica pra fase de empacotamento (7J).

- Diretório novo `app/` no monorepo (não confundir com `public/` do admin):
  ```
  app/
    public/           — index.html, app.js, app.css (HTML/CSS/JS puro, igual ao admin)
    capacitor.config.ts
    android/          — gerado pelo `npx cap add android`
    ios/              — gerado pelo `npx cap add ios`
    package.json      — só pra deps do Capacitor + plugins
  ```
- 2 modos no mesmo bundle (decidido por role do JWT no login):
  - `role=tecnico` → fluxo de campo (lista de chamados, O.S., GPS)
  - `role=cliente` → fluxo de acompanhamento (telemetria, abrir/acompanhar chamado)
- Reuso visual: copia paleta Mission Control + componentes (`.rc`, cards) do admin pra manter identidade
- Build: `npm run build:app` → copia `app/public/` pra `app/www/` → `npx cap sync`
- Splash + ícone: a partir do `logo-menu.png`, gerados via `@capacitor/assets`

#### 7B — Autenticação e onboarding ✅ CONCLUÍDO

Commits `0731d23` (login+OTP+home) + `aba47da` (refactor visual) + commit deste branch (login alinhado ao site).

**O que foi feito:**
- Login + OTP + home placeholder no app, consumindo `POST /auth/login` + `POST /auth/verify-otp` existentes
- Token JWT salvo em `localStorage` (wrapper `Storage`); migrar pra `Capacitor Preferences` quando empacotar
- Visual do login do app **idêntico ao do site** (mesmo `login-card`, `loginLogo`, `login-field`, `.login-btn`, glow radial, footer) — copiados verbatim de `public/login.css` pra `app/public/app.css`
- Splash com logo real (`login-logo.png`) em vez do "GB" placeholder
- Roteamento pós-login: `role=tecnico` abre tela de chamados (7C); demais mantêm home placeholder

**Pendente** (não bloqueante pra MVP de dev):
- Biometria (`@capacitor-community/biometric-auth`) — pra empacotamento
- Trusted device com `Capacitor Preferences` em vez de `localStorage` — idem
- Deep link OTP `general-bombas://otp?code=...` — idem

- Reusa endpoints existentes (`POST /auth/login` + JWT). Sem reescrever auth.
- **Trusted device** do app é mais permissivo que web: token salvo em `Capacitor Preferences` (storage nativo criptografado), válido por 30 dias
- Tela de login com biometria (Touch ID / Face ID / impressão digital) via `@capacitor-community/biometric-auth`
- OTP via WhatsApp (já implementado pro web) também roda no app — usa deep link `general-bombas://otp?code=...`

#### 7C — Tela inicial do técnico ✅ CONCLUÍDO

Commit `0dacff6`.

**Backend:**
- Migration `017_role_tecnico.sql` libera `role='tecnico'` no CHECK constraint de `usuarios` (antes só admin/admin_viewer/cliente)
- `POST /auth/registrar` aceita `role=tecnico` com `tecnico_id` opcional. Em transação: cria usuário + vincula a registro existente em `tecnicos` (atualiza `tecnicos.usuario_id`) OU cria registro novo em `tecnicos` com mesmo nome/email
- `GET /chamados/meus` (substitui o `responsavel_id = me` do plano original — usamos `tecnicos.usuario_id` que já existia da Fase 7F): resolve `tecnicos.id` via JWT, retorna chamados com endereço/lat/lng do condomínio, telefone do cliente WhatsApp, filtros `?status=csv` e `?abertos=1`. Ordena por status > prioridade > data
- Migration `017_role_tecnico.sql` aplicada no Railway (verificado via `pg_constraint`: `usuarios_role_check` inclui `'tecnico'`)

**App:**
- Tela "Meus chamados" com header (logo real `login-logo.png` + nome do técnico + bolinha pulsante de status em campo / em atendimento / em dia)
- 4 KPIs no topo (cards `.rc` copiados verbatim do admin): Abertos / Em atendimento / Críticos / Fechados hoje — cor adaptativa
- Tabs Hoje / Próximos / Histórico no padrão `wa-tabs/wa-tab/wa-count` do admin
- Cards de chamado com ícone de prédio em quadrado colorido por prioridade (estilo `.rc-icon`/`.head-icon`), glow na borda esquerda, hover lift, pills do admin (`ch-cat-badge`, `ch-st`)
- Ordenação por proximidade (Haversine vs GPS via `navigator.geolocation` cacheado 5min) / prioridade / data
- Polling silencioso a cada 30s
- Rodapé fininho mono-espaçado: `X chamados · GPS ativo/aguardando · HH:MM`
- Empty state minimal (SVG sutil + frase contextual por aba)
- Modo demo `?demo=1` com 8 chamados fake (emergencia em atendimento + variações) — pula login

#### 7C-original — Plano descritivo

- **Lista de chamados atribuídos** (filtro `responsavel_id = me` em `/chamados`)
- Cada card: condomínio, endereço, prioridade (badge), categoria, tempo aberto, distância (Haversine entre GPS atual e `condominios.lat/lng`)
- Ordenação configurável: **proximidade** (default) / prioridade / data
- 3 tabs: **Hoje** (atribuídos não concluídos) / **Próximos** (agendados) / **Histórico** (concluídos)
- Botão flutuante "🔄" pra forçar refresh + indicador de quando foi o último sync

#### 7D — Tela do chamado + ciclo de atendimento ✅ CONCLUÍDO

Commit `0dacff6`.

**Backend:**
- `GET /chamados/meus/:id`: valida ownership do técnico via JWT, retorna chamado + condomínio completo (endereço/CEP/lat/lng/telefone) + reservatórios do condomínio com última leitura + alertas + status offline + O.S. vinculada (se houver) + últimas 10 mensagens WhatsApp
- `POST /chamados/:id/iniciar-atendimento`: aceita `{lat, lng, precisao_m?}`, valida técnico autenticado. Idempotente — se já tem O.S. rascunho, retorna ela; senão cria O.S. com `chegada_em=NOW()` + `chegada_lat/lng`, vincula `chamados.ordem_servico_id`, muda status pra `em_atendimento`. Também grava ping em `tecnico_localizacoes`. Tudo em uma transação.

**App:**
- Header com voltar + logo (28px discreta) + condomínio + pill de status colorido (azul aberto / amber pulsante em_atendimento / verde fechado)
- Hero com endereço completo + 2 botões: **Abrir no Maps** (link `google.com/maps/dir/?destination=lat,lng`) e **Ligar** (`tel:` link, disabled se sem telefone)
- Pills categoria + prioridade
- Bloco timer (só em_atendimento): caixa amber com "Atendendo há HH:MM:SS" rolando + número da O.S. + hora da chegada
- Bloco telemetria: cards compactos por reservatório com barra de nível colorida por faixa (verde/cyan/amber/vermelho) + pill bomba LIGADA/DESLIGADA + tempo da última leitura + alerta de OFFLINE em vermelho
- Bloco conversa WhatsApp (se houver): bubbles estilo WhatsApp com hora
- Bloco descrição
- CTA sticky no rodapé: adapta por status — "Iniciar atendimento" (aberto, pede GPS) → "Preencher Ordem de Serviço" (em_atendimento, abre 7E) → some (fechado)

#### 7D-original — Plano descritivo

Estados visíveis pro técnico:

```
[aberto]                                — chamado atribuído a mim
   ↓ "🚗 Iniciar atendimento"
[em_atendimento] (GPS chegada gravada)  — tracking ativo, timer rodando
   ↓ "📋 Preencher O.S."
[preenchendo_os]                        — formulário multi-etapa
   ↓ assina + finaliza (GPS saída gravada)
[concluido]                             — PDF gerado, email enviado, fora da fila
```

- Header com nome do condomínio, endereço completo (com botão "📍 Abrir no Maps" → `Capacitor App.openUrl()` pra Google/Apple Maps)
- Detalhe: descrição, categoria, prioridade, conversa WhatsApp que originou (se houver)
- **Última telemetria** do condomínio (nível dos reservatórios, status das bombas) — reutiliza endpoint existente
- Botão grande "🚗 Iniciar atendimento" → registra GPS chegada via `@capacitor/geolocation`, muda status pra `em_atendimento`, ativa background tracking

#### 7E — Ordem de Serviço digital ✅ CONCLUÍDO

**Commitado neste branch** (ainda não pushado): formulário completo + auto-save + upload de fotos + assinatura + finalização com GPS de saída. Falta o pós-finalização (PDF + email) que é grande e não bloqueia o fluxo.

**✅ Backend feito:**
- `src/app.js`: `express.json({ limit: '8mb' })` (pra fotos base64) + `app.use('/uploads', express.static(...))`
- `src/routes/ordens-servico.routes.js`:
  - Middleware factory `osDonoOuAdmin({ forWrite })` permite admin/admin_viewer OU técnico dono da O.S. `forWrite=true` bloqueia escrita em O.S. finalizada ou com chamado fora de `em_atendimento`
  - Aplicado em: `GET /:id`, `PATCH /:id`, `POST /:id/fotos`, `DELETE /:id/fotos/:foto_id`, `POST /:id/pecas`, `DELETE /:id/pecas/:peca_id`, `POST /:id/finalizar`
  - `POST /:id` (criar) e `GET /` (listar) seguem `adminOnly` — técnico não cria O.S. arbitrária nem lista todas
  - Nova rota `POST /:id/fotos/upload`: aceita `{ image_base64, tipo, legenda }`, decodifica base64 (max ~4 MB), salva em `uploads/os/{os_id}/{uuid}.jpg`, registra metadado em `os_fotos` com `url=/uploads/...`
  - `POST /:id/finalizar` agora aceita `{ lat, lng }` opcionais e grava `saida_em + saida_lat + saida_lng` na mesma transação que fecha o chamado
- `.gitignore` agora ignora `uploads/`

**✅ App feito:**
Nova screen `tecnico-os`:
- Header com voltar + logo + número da O.S. + pill "Em atendimento"
- Banner amber com timer rolando ("Atendendo há HH:MM:SS") + barra de progresso amber + contador "X de 7 seções preenchidas"
- 8 seções accordion (ícone numerado vira ✓ verde quando completa, borda fica verde, badge "OBRIG." some):
  1. **Tipos** — chips multi-select com glow amber
  2. **Equipamentos** — 13 toggles individuais (slider amber)
  3. **Correntes** — radio Mono/Bi/Tri ativa 1/2/3 inputs numéricos
  4. **Fotos** — picker antes/depois/geral + grid com X de remover + botão "Foto" abre câmera (`capture=environment`) ou galeria. Compressão client-side (max 1600px, q=0.75) → base64 → `POST /:id/fotos/upload`
  5. **Peças** — lista repetível com add/remove (⚠️ edição inline ainda não persiste, ver pendência abaixo)
  6. **Observações** — textarea max 2000 chars com contador
  7. **Resolução** — radio resolvido/paliativo/agravado + toggle "Necessário retorno" + date picker condicional
  8. **Quem recebeu + Assinatura** — nome + radio gestor/síndico/portaria + canvas 180px DPR-aware (touch + mouse), botão "Limpar"
- Auto-save debounced 600ms a cada mudança → `PATCH /ordens-servico/:id` (campo individual)
- CTA "Confirmar e finalizar O.S." sticky no rodapé — só habilita com obrigatórios prontos (tipos ≥ 1, resolução escolhida, recebido+assinatura completos)
- Finalizar pede GPS, chama `POST /:id/finalizar` com `{lat, lng}`, mostra tela de sucesso, volta pra lista

**✅ Edição inline de peças (concluído):** `PATCH /ordens-servico/:id/pecas/:peca_id` aceita `descricao`/`quantidade`/`observacao` com validação (descricao não vazia, max 255 chars; quantidade inteira > 0). Frontend: listener `input` no `#osPecas` com debounce de 600ms por par (peça, campo) via `OS.pecaDebounce` (Map). Valor inválido (quantidade ≤ 0 ou descrição vazia) não dispara PATCH — espera até o usuário corrigir.

**✅ Orçamento pelo técnico (concluído):** seção opcional no formulário da O.S. Técnico só *explica* o orçamento (o que encontrou, o que sugere); admin monta o formal depois. Estrutura mínima:
- Migration `018_os_orcamento.sql`: 2 colunas em `ordens_servico` (`orcamento_necessario BOOLEAN`, `orcamento_observacoes TEXT`) + index parcial `WHERE orcamento_necessario = true` (já pensando na página "Orçamentos pendentes" futura). Aplicada no Railway.
- Backend (`PATCH /ordens-servico/:id`): aceita ambos os campos com validação (max 4000 chars).
- App: nova seção "Orçamento" entre Observações e Resolução. Toggle "Necessário orçamento?" + textarea condicional. Auto-save 600ms. Subtítulo dinâmico ("Opcional" / "Sim — X caracteres").
- PDF (`os-pdf.service.js`): **não aparece no PDF**. Decisão consciente: a explicação do técnico é anotação interna pro admin. Se fosse pro PDF, o síndico poderia interpretar como orçamento fechado e questionar quando o valor formal viesse. O síndico só fica sabendo quando a administração contatar com o orçamento real.
- Admin: `GET /chamados` agora retorna `orcamento_necessario` e `orcamento_observacoes` via LEFT JOIN com `ordens_servico`. No drawer (aba Chamados), card ganha borda amber + pill "💰 Orçamento" + bloco amber com a explicação do técnico. Helper `escapeHtml` adicionado em `admin.js`.
- **Próximo:** página dedicada "Orçamentos" no menu admin pra listar todos os chamados com `orcamento_necessario = true` (usando o index parcial) — não feita ainda.

**⚠️ Bug crítico encontrado durante essa fase:** migrations `015_ordens_servico.sql` e `016_tecnico_localizacoes.sql` **nunca tinham sido aplicadas no Railway** (apesar do plano marcar a Fase 7E como concluída). Tabelas `ordens_servico`, `os_fotos`, `os_pecas`, `tecnico_localizacoes` não existiam em produção. Aplicadas agora junto com a 018. Lição: ao concluir uma fase com migration, confirmar no banco real além do código.

**✅ Geração de PDF da O.S. (concluído):** stack Puppeteer (já era dep do projeto via `relatorio.routes.js`), não pdfkit. Arquivos:
- `src/services/os-pdf.service.js`: `gerarPdfOS(osId)` busca dados (O.S. + cond + tec + fotos + peças), monta HTML fiel à referência `public/ordem-de-servico.png` (logo General base64, cabeçalho amber, 9 checkboxes de tipo em grid 3×3, bloco Dados, 13 equipamentos em 2 colunas com checkbox, tabela CORRENTE Mono/Bi/Tri × 3 fases, horários com GPS, observações, peças, resolução, assinatura embed). Fotos em página extra (grid 2 colunas com legenda + tipo).
- `POST /:id/finalizar`: dispara `setImmediate(() => gerarPdfOS(id))` após commit — não bloqueia o response.
- `GET /:id/pdf`: serve `uploads/os/{id}/os-{numero}.pdf`. Se o arquivo não existir (background falhou ou ainda não rodou), gera **on-demand**.
- App (`mostrarOSSucesso`): botão **📄 Baixar PDF** na tela de sucesso. Usa `baixarPdfOS()` (fetch com Bearer + blob + download via `<a>` invisível) — funciona em demo nada (escondido) ou backend real.

**✅ Fotos obrigatórias condicionais (concluído):** quando `tipos_servico` inclui `instalacao_pecas` ou `chamado_emergencial`, finalizar a O.S. exige pelo menos 1 foto. Backend (`POST /:id/finalizar`) faz `SELECT COUNT(*) FROM os_fotos WHERE os_id=$1` antes do UPDATE e rejeita com 400 se zero. App valida o mesmo localmente em `finalizarOS()` (lendo `OS.data.fotos`) pra dar feedback imediato sem round-trip — backend é o gatekeeper definitivo.

**Decisões conscientes (não implementar):**

- **Email pro síndico com PDF anexo** — descartado. A O.S. fica interna na empresa inicialmente; o cliente não recebe cópia automática. Se mudar de ideia depois, o PDF já existe e o Resend está integrado, é trivial.
- **Endpoint `PATCH /chamados/:id/executar`** — não necessário. Hoje o chamado fecha direto via `POST /:id/finalizar` da O.S. dentro da mesma transação. A regra "sem O.S., não fecha chamado" continua valendo porque é o `finalizar` da O.S. que fecha o chamado.

#### 7E-original — Plano descritivo

A O.S. paper em `public/ordem-de-servico.png` é a referência. O fluxo digital preserva 100% do que captura, melhora aproveitando ser digital.

**Pré-preenchimento automático** (técnico só edita o que muda em cada visita):
- **Data** (hoje), **Técnico** (do JWT), **OS/Nº** (gerado pelo backend: `OS-2026-0042`)
- **Cliente / Endereço / Bairro** vêm de `condominios` via `chamado_id`

**Campos do formulário (acordeon multi-etapa):**

1. **Tipos de serviço** (chips multi-select, ≥1 obrigatório):
   `retirada_equipamento`, `vistoria_contrato`, `visita_tecnica`, `devolucao`, `limpeza_piscina`, `limpeza_caixas`, `chamado_emergencial`, `preventiva_mensal`, `instalacao_pecas`

2. **Equipamentos verificados** (lista vertical com switches, ≥1 obrigatório OU observação preenchida):
   - Comando elétrico, Bombas de recalque, Bombas de sucção, Bombas de piscina, Bombas de pressurização, Bombas de cascata, Bombas de espelho d'águas, Linha dos automáticos, **Painéis solares** *(corrigido: era "PAINEL SOLARES")*, **Válvula redutora de pressão** *(corrigido: era "VÁVULA")*, **Válvula de retenção** *(corrigido)*, Estação de tratamento, Grupo gerador

3. **Correntes elétricas** (Mono / Bi / Tri):
   - Radio único pra tipo, depois 1/2/3 inputs numéricos condicionais
   - Salvo como `{ tipo: 'tri', valores: [3.2, 3.1, 3.3] }`

4. **Fotos** (categorizadas, compressão no client antes do upload):
   - Tipos: `antes` / `depois` / `geral`
   - Plugin: `@capacitor/camera` (câmera nativa + galeria)
   - Compressão: máx 1600px de lado maior, qualidade 0.75 (~150-300KB cada)
   - **Obrigatórias** quando tipos contiverem `instalacao_pecas` ou `chamado_emergencial`

5. **Peças usadas / substituídas** (lista repetível, opcional):
   - `{ descricao, quantidade, observacao }` — facilita controle de estoque e cobrança futura

6. **Observações gerais** (textarea, máx 2000 chars)

7. **Resolução** (radio obrigatório):
   - `resolvido` (problema sanado) / `paliativo` (medida temporária) / `agravado` (descobriu coisa pior)
   - **Necessário retorno** sim/não — se sim, sugere data com date picker

8. **Quem recebeu** + **Assinatura**:
   - Nome de quem recebeu + tipo (`gestor` / `sindico` / `portaria`)
   - Canvas full screen pra assinatura digital (dedo na tela)
   - Salva como PNG base64 no banco (~10-30 KB)

**Finalização:**
- Toca "✅ Confirmar e finalizar"
- App registra GPS saída + `saida_em` via `@capacitor/geolocation`
- Backend muda `chamados.status = 'concluido'`, gera PDF idêntico ao formulário paper original (logo General + paleta) via `pdfkit` no servidor
- Email automático pro síndico com PDF anexo (Resend, já integrado)
- PDF fica disponível no histórico do condomínio — cliente/síndico vê pelo app
- Endpoint `PATCH /chamados/:id/executar` **só aceita se** `ordens_servico.finalizada_em IS NOT NULL` (regra de negócio: sem O.S., não fecha)

**Schema novo:**

```sql
-- Migration 015_ordens_servico.sql
CREATE TABLE ordens_servico (
  id              SERIAL PRIMARY KEY,
  numero          VARCHAR(20) UNIQUE NOT NULL,           -- 'OS-2026-0042'
  chamado_id      INTEGER REFERENCES chamados(id) ON DELETE SET NULL,
  condominio_id   INTEGER REFERENCES condominios(id),
  tecnico_id      INTEGER REFERENCES usuarios(id),

  tipos_servico   TEXT[] NOT NULL,

  chegada_em      TIMESTAMPTZ,
  chegada_lat     NUMERIC(9,6),
  chegada_lng     NUMERIC(9,6),
  saida_em        TIMESTAMPTZ,
  saida_lat       NUMERIC(9,6),
  saida_lng       NUMERIC(9,6),

  recebido_nome   VARCHAR(255),
  recebido_tipo   VARCHAR(20),                           -- 'gestor'|'sindico'|'portaria'

  itens_verificados JSONB,                               -- { "comando_eletrico": true, ... }
  correntes       JSONB,                                 -- { "tipo": "tri", "valores": [...] }

  observacoes     TEXT,

  servico_realizado VARCHAR(20),                         -- 'resolvido'|'paliativo'|'agravado'
  necessario_retorno BOOLEAN DEFAULT false,
  retorno_sugerido_em DATE,

  assinatura_b64  TEXT,                                  -- PNG base64

  pdf_url         TEXT,

  criado_em       TIMESTAMPTZ DEFAULT NOW(),
  finalizada_em   TIMESTAMPTZ
);

CREATE TABLE os_fotos (
  id          SERIAL PRIMARY KEY,
  os_id       INTEGER REFERENCES ordens_servico(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  legenda     VARCHAR(255),
  tipo        VARCHAR(20),                               -- 'antes'|'depois'|'geral'
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE os_pecas (
  id          SERIAL PRIMARY KEY,
  os_id       INTEGER REFERENCES ordens_servico(id) ON DELETE CASCADE,
  descricao   VARCHAR(255) NOT NULL,
  quantidade  INTEGER DEFAULT 1,
  observacao  TEXT
);

ALTER TABLE chamados ADD COLUMN IF NOT EXISTS ordem_servico_id INTEGER REFERENCES ordens_servico(id);
```

**Endpoints novos:**

```
POST   /ordens-servico                    — cria O.S. (status: rascunho)
PATCH  /ordens-servico/:id                — atualiza campos (multi-etapa)
POST   /ordens-servico/:id/fotos          — upload de foto (multipart)
DELETE /ordens-servico/:id/fotos/:foto_id
POST   /ordens-servico/:id/finalizar      — gera PDF, dispara email, fecha chamado
GET    /ordens-servico/:id/pdf            — baixa o PDF gerado
GET    /chamados/:id/ordem-servico        — retorna O.S. vinculada (se houver)
```

**Storage das fotos:** começa em `public/uploads/os/{os_id}/` no próprio servidor (barato e simples). Migrar pra Cloudinary/S3 só quando volume justificar (>10GB).

#### 7F — Rastreamento GPS dos técnicos ✅ CONCLUÍDO

Backend já existia (Fase 7D introduziu os endpoints + migration 016): `POST /tecnicos/localizacao` (ping), `GET /tecnicos/localizacao` (admin lista posições atuais), `GET /tecnicos/:id/historico-gps` (trilha). Faltava o app enviar pings e o admin renderizar no mapa. Implementado nessa rodada:

**App (`app/public/app.js`):**
- Módulo `GPS` (state + start/stop) usa `navigator.geolocation.watchPosition` (alta precisão) + setInterval de garantia. Envia ping pro backend a cada **60s**. Não tem pausar/retomar — decisão de política de gestão. Limitação consciente do navegador: pausa quando a tela apaga ou app vai pra background. Quando empacotar com Capacitor (Fase 7J), troca a implementação por `@capacitor-community/background-geolocation` mantendo a mesma API interna (`gpsStart/gpsStop`).
- **Trigger:** liga em `iniciarAtendimento` após sucesso e em `abrirChamado` quando o chamado já está `em_atendimento` (refresh/reabertura do app). Desliga em `mostrarOSSucesso` (finalizou), no logout do técnico e no 401 (sessão expirada).
- **Chip visual `#gpsChip`** flutuante no canto superior direito (criado dinamicamente): bolinha verde pulsante + "GPS ativo". **Não é clicável** (`pointer-events: none`) — decisão consciente: técnico não pode pausar o rastreamento (política de gestão). O chip existe pra transparência, pra ele saber que está sendo rastreado.
- CSS em `app.css` com glassmorphism + animação `gpsPulse`.

**Admin (`public/admin.js` + `public/admin.css`):**
- `carregarTecnicosLocalizacao()` busca `/tecnicos/localizacao` em paralelo com chamados/conversas, dentro do polling de 20s (`carregarAtendimento`).
- Layer adicional no Leaflet da seção Mapa: pinos circulares violeta com iniciais do nome (`DivIcon` CSS-only), `zIndexOffset: 1000` pra ficar acima dos pinos de condomínio, pulse animado.
- **Popup ao clicar** mostra: nome + especialidade, badge "EM ATENDIMENTO" + chamado/condomínio (se houver), tempo relativo da última atualização ("agora", "há 5 min", "há 2 h"), bateria se reportada. Link "Ver no painel →" seleciona o condomínio no painel lateral do mapa.
- Pinos antigos (técnicos que sumiram da resposta) são removidos automaticamente do mapa.

**Job de limpeza (`src/jobs/gps-cleanup.job.js`):**
- `setTimeout` recursivo (padrão do projeto, igual offline.job): roda 1×/dia. Primeira execução 5min após boot pra não pesar o startup.
- `DELETE FROM tecnico_localizacoes_historico WHERE capturada_em < NOW() - X hours` — X vem da config `gps.retencao_horas` (default 24, range 1-720h via whitelist em `config.service.js`).
- Sem essa limpeza a tabela cresce ~1 ping/min/técnico em atendimento (≈ 1.500/dia por técnico ativo).
- Boot do app (`src/app.js`) chama `startGpsCleanupScheduler()`.

**Decisões conscientes:**
- **Sem aba "Operacional" em Configurações ainda** — a frequência do ping (60s) está hardcoded no app. Quando virar APK e a frequência precisar variar por contexto (e.g., 30s em emergência), expõe via config. Por enquanto valor único basta.
- **Sem trilha histórica visualizada** — backend grava em `tecnico_localizacoes_historico` e o endpoint `/tecnicos/:id/historico-gps` existe, mas a UI de "ver rota do técnico do dia" fica pra quando alguém pedir.
- **Sem layer no dashboard Mission Control** — feito só na seção Mapa (onde já tem Leaflet completo). Adicionar no dashboard é trivial mas duplicaria código sem ganho proporcional pro MVP.

**✅ Refinamentos posteriores (mesmo branch):**

- **GPS sempre ativo enquanto logado** — mudança de regra: antes ligava em `iniciarAtendimento` e desligava em `mostrarOSSucesso`. Agora liga em `abrirTelaTecnico` (logo após login) e só para em logout/401. Motivo: o admin precisa ver onde cada técnico está pra decidir designação por proximidade, não só quando ele já está atendendo. `gpsStart(chamadoId)` virou idempotente — chamadas em `iniciarAtendimento` e `abrirDetalheChamado` continuam funcionando como antes mas só atualizam o `chamadoId` de contexto, sem reiniciar o watch.
- **`bateria_pct` enviado** — `gpsEnviar()` agora lê `navigator.getBattery()` (cacheado em `GPS.battery`) e inclui no body. Backend e popup do admin já tavam preparados, só faltava o app mandar. Null-safe pra iOS Safari (que não implementa).
- **Banner de aviso quando GPS falha** — faixa vermelha sticky no topo das telas do técnico, com mensagem específica por tipo de erro (`PositionError.code`): permissão negada, sinal indisponível, timeout, contexto não seguro (sem HTTPS). Botão "Permitir GPS" / "Tentar novamente" dispara `getCurrentPosition()` pra re-abrir o prompt; se já estava `denied`, abre `alert` explicando como reabrir nas configs do navegador. Some sozinho quando o watch volta a receber posição. Reavaliado a cada `showScreen()` pra não aparecer em login/cliente.
- **Janela de operação 08:00–18:00 (horário local)** — GPS só envia pings dentro do expediente. Fora dessa faixa o `watchPosition` é desligado (economia de bateria + privacidade do técnico). Refatoração interna: `gpsStart`/`gpsStop` viraram porta pública que setam `GPS.scheduled`; funções privadas `_gpsAbrirWatch`/`_gpsFecharWatch` controlam o watch real; `_gpsAplicarJanela` decide o estado a cada 60s via `GPS.horarioTimer`. Religa às 8h e desliga às 18h sem precisar logout/login. Chip ganha variante cinza "Fora do expediente" (sem pulso, classe `.gps-chip-paused`) quando o técnico está logado mas fora da janela. Constantes `GPS_HORA_INI = 8` e `GPS_HORA_FIM = 18` no topo do módulo. Última posição registrada no admin permanece visível (não some) — útil pra saber onde o técnico terminou o turno.

#### 7F-original — Plano descritivo

- Plugin: `@capacitor-community/background-geolocation`
- Tracking ligado automaticamente quando técnico está em chamado com status `em_atendimento`
- Frequência configurável em **Configurações > Operacional**: padrão 60s
- **Otimização de bateria:** plugin usa significant-change-only do iOS e fused location do Android — não polling cego
- Notificação persistente Android "📍 Rastreando localização — General Bombas" (exigência do sistema; honesto com o técnico)
- Endpoint `POST /tecnicos/localizacao` — recebe `{lat, lng, precisao_m, capturada_em}`, sobrescreve a última em `tecnico_localizacoes`
- **Privacidade:**
  - Tracking só liga durante chamado ativo (fora disso, app não rastreia)
  - Localizações > 24h são apagadas por job diário (config dinâmica de retenção)
  - Técnico vê toggle "Pausar rastreamento" no menu (com confirmação) — útil pra horário de almoço; admin recebe aviso

**Schema:**

```sql
-- Migration 016_tecnico_localizacoes.sql
CREATE TABLE tecnico_localizacoes (
  usuario_id    INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  lat           NUMERIC(9,6) NOT NULL,
  lng           NUMERIC(9,6) NOT NULL,
  precisao_m    NUMERIC(6,1),
  bateria_pct   INTEGER,                                 -- opcional, plugin reporta
  capturada_em  TIMESTAMPTZ NOT NULL,
  atualizada_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tecnico_localizacoes_historico (
  id            BIGSERIAL PRIMARY KEY,
  usuario_id    INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  lat           NUMERIC(9,6) NOT NULL,
  lng           NUMERIC(9,6) NOT NULL,
  precisao_m    NUMERIC(6,1),
  capturada_em  TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_tec_loc_hist ON tecnico_localizacoes_historico(usuario_id, capturada_em DESC);
```

- Tabela `tecnico_localizacoes` (1 linha por técnico, sobrescrita) → consultas rápidas pro mapa
- Tabela `tecnico_localizacoes_historico` (append-only, retenção de 24h ou configurável) → trilha do dia, útil pra auditoria

**Integração com o mapa admin:**

- `GET /admin/tecnicos/localizacao` retorna lista `{usuario_id, nome, lat, lng, em_atendimento_no_condominio_id, capturada_em}`
- Mapa Leaflet existente (seção Mapa + dashboard Mission Control) ganha layer extra: ícones de técnico (DivIcon CSS com avatar de iniciais) ao lado dos pinos de condomínio
- Clicar no ícone do técnico → popup com nome + qual chamado está atendendo + botão "Ver no painel"
- Polling de 20s (mesma cadência dos outros dados do dashboard)

#### 7G — Push notifications nativas ⏸️ ADIADA (depende da 7J)

Decisão consciente: push nativo (FCM/APNs) só funciona após empacotar com Capacitor. Sem APK não dá pra registrar token no `@capacitor/push-notifications`. Implementar a infra backend agora ficaria sem como testar de ponta a ponta. Volta depois que o app virar APK na 7J — aí cria projeto Firebase, instala o plugin, registra token no boot e plugar nos triggers (chamado atribuído, status mudou, alerta crítico).

#### 7G-original — Plano descritivo

Capacitor Push usa **FCM (Firebase Cloud Messaging)** no Android e **APNs (Apple Push Notification service)** no iOS direto — sem o intermediário do Web Push.

- Plugin: `@capacitor/push-notifications`
- Setup Firebase pro Android (free tier suficiente) + Apple Developer pra APNs
- Migration `017_push_tokens.sql`: `push_tokens(usuario_id, token UNIQUE, platform, ultima_atividade)` — diferente de `push_subscriptions` da PWA porque o formato do token é nativo
- Endpoint `POST /push/registrar-token` (token vem do plugin no boot do app)
- Backend usa `firebase-admin` (Android) e `node-apn` (iOS) — wrappers de envio em `src/services/push.service.js`
- Mesma lógica anti-spam do email (Fase 6E): dispara só quando alerta novo
- **Triggers:**
  - Técnico recebe push quando chamado é atribuído a ele
  - Técnico recebe push quando admin reatribui chamado
  - Cliente recebe push quando chamado dele muda de status (atendimento iniciado / concluído)
  - Cliente recebe push de alertas críticos do seu condomínio (telemetria offline / nível crítico)
- Anti-flood: limite de 1 push por evento por usuário por 30 min (tabela `push_dedup`)
- Janelas de silêncio configuráveis em **Perfil > Notificações** do app (default 22h–7h pra cliente, sempre ligado pra técnico em horário comercial)

#### 7H — App do cliente / síndico ✅ MVP CONCLUÍDO

Mesmo bundle `app/public/`, fluxo decidido por `user.role === "cliente"` no `mostrarPosLogin`.

**Backend** (em `src/routes/cliente.routes.js` — estendido):
- `GET /cliente/chamados?status=csv` — lista chamados do condomínio do JWT, ordenados por status (em_atendimento > aberto > fechado) > data desc. Inclui `tecnico_nome` e `os_finalizada_em` via JOIN.
- `GET /cliente/chamados/:id` — detalhe + O.S. vinculada (`os_id`, `os_numero`, `os_finalizada_em`). Valida `condominio_id` no WHERE.
- `POST /cliente/chamados` — abre chamado: aceita `categoria` (enum), `prioridade`, `descricao` (min 5, max 4000 chars). Status nasce `aberto`. Sem WhatsApp/conversa (NULL).
- `GET /cliente/ordens-servico/:id/pdf` — serve PDF da O.S. validando que ela pertence ao condomínio do cliente. Mesma lógica on-demand do endpoint do técnico (gera se faltar).

**App** — 5 screens novas no `index.html`, bottom nav com **3 abas** (Início / Telemetria / Chamados):
- `cliente-home` — header com nome+endereço do condomínio, KPIs (Offline / Alertas / Em aberto), CTA "Abrir chamado", grid 2-col de reservatórios (barra de nível + pill bomba + pill alertas), lista dos 3 chamados mais recentes.
- `cliente-telemetria` — chips horizontais com os reservatórios + chips de período (24h / 7 dias / 30 dias). Card com 4 stats (Mín / Médio / Máx / Leituras) + line chart Chart.js (paleta amber, fundo dark) consumindo `/cliente/historico`. Chart.js carregado **lazy** via `${API_BASE}/static/chart.umd.min.js` só quando o cliente abre a aba — não pesa o boot. Reaproveita `Chart` global se cliente entrar na aba múltiplas vezes (destroi/recria sem dup). Botão **"📄 Baixar relatório (PDF)"** abaixo do gráfico — usa o endpoint existente `/relatorio/pdf?device_id=X&dias=N` (mesmo que o `cliente.html` web já consumia, role=cliente autorizado).
- `cliente-chamados` — tabs com contadores (Todos / Abertos / Em atendimento / Fechados), cards por chamado clicáveis, FAB amber pra abrir novo.
- `cliente-novo-chamado` — form simples: select categoria (7 opções amigáveis), select prioridade, textarea descrição. Submit volta pra lista na aba "Abertos".
- `cliente-chamado-detalhe` — pill de status + prioridade + categoria, descrição do problema, **timeline 3 passos** (Chamado registrado → Em atendimento (técnico) → Atendimento concluído) com dot ✓ verde / amber pulsante / cinza, botão "📄 Baixar Ordem de Serviço (PDF)" quando há O.S. finalizada.

Polling 20s na home pra status + chamados. Para no logout.

**Decisões conscientes (não MVP):**
- **Mapa do condomínio / técnico se movendo** — descartado por escolha do usuário. Cliente não tem nenhuma tela de mapa no app. Se algum dia mudar, é trivial adicionar (Leaflet + GPS dos técnicos já existem).
- **WhatsApp read-only do condomínio** — descartado por enquanto. Cliente fala com a empresa pelo WhatsApp normal dele, não pelo app.

**✅ Polimento + Conta + Mensagens + Avaliação (mesmo branch):**

Depois do MVP, várias frentes simultâneas:

- **Refactor visual pra reaproveitar o Mission Control:** as 5 telas do cliente foram reescritas pra usar verbatim os componentes do admin — `.resumo-grid` + `.rc` (KPIs), `.card.tec-card` + `.cardHead` + `.head-icon` (seções), `.ch-list-mob` + `.ch-row-mob` (cards de chamado iguais ao app do técnico), `.wa-tabs` + `.wa-tab.is-active` (tabs com contador), `.td-card`/`.td-status-pill` (detalhe). Removidas ~150 linhas de classes `.cli-*` paralelas em `app/public/app.css` que duplicavam o admin. Sobrou só o que é exclusivo de mobile: `.cli-nav` (bottom-nav), `.cli-fab`, mini-cards de reservatório, timeline. Bug crítico do `.app-main` (que centralizava o conteúdo de todas as telas como flex-row): regra escopada com `[data-screen="home"] .app-main { ... }` pra valer só no placeholder antigo.
- **Áreas de toque mobile:** `.btn` ganhou `min-height: 38px`, `.btn-sm` foi de ~26px pra 36px, `.wa-tab` de ~28px pra 36px, botões da nav de ~36px pra 52px. `cli-nav` agora tem `flex-shrink: 0` + `tec-shell { flex: 1 }` pra resolver o sticky bottom-nav que "subia até metade da tela" quando o conteúdo era curto.
- **Tela "Conta" (4ª aba do bottom-nav)** — substitui o botão de logout do header. Cards: "Seus dados" (avatar com iniciais + nome + email + condomínio + endereço) e "Alterar senha" (form de senha atual / nova / confirmar, validação completa, submit em `POST /cliente/trocar-senha` que já existia). Botão "Sair da conta" em vermelho no rodapé.
- **Prioridade automática:** cliente NÃO escolhe mais prioridade no form de novo chamado (estavam marcando tudo como emergência). Backend `POST /cliente/chamados` ignora o campo do body e deriva via `CATEGORIA_PRIORIDADE`: `sem_agua → emergencia`, `vazamento|bomba_falha → alta`, `nivel_baixo|outro → media`, `manutencao|ruido → baixa`. Mesmo mapa duplicado em `app.js` (`CLI_CAT_TO_PRIO`) só pro modo demo offline.
- **KPIs clicáveis na home:** os 3 cards (Offline / Alertas / Em aberto) viraram `<button class="rc">`. Offline e Alertas → Telemetria; Em aberto → Chamados na aba "Abertos". `.rc` ganhou `appearance: none; font: inherit` pra ficar idêntico ao `<div>` quando vira `<button>`.
- **Renomeação `abrirDetalheChamadoCli`** — corrige colisão silenciosa: a função `abrirDetalheChamado` existia em 2 lugares (linha 685 = técnico, linha 2796 = cliente), e a do cliente sobrescrevia a do técnico via hoisting. Agora cada uma tem seu nome.

**✅ Thread de mensagens cliente ↔ técnico (Migration 019):**

Comunicação dentro do chamado, depois de aberto. Cliente pode dizer "agora piorou, segue foto" e o técnico responde. Estrutura reaproveita `alerta_comentarios` (já usada pra comentários de alerta no admin):

- Migration `019_chamado_mensagens.sql`: adiciona `foto_url TEXT` em `alerta_comentarios`, relaxa `texto NOT NULL` e adiciona constraint `CHECK (texto IS NOT NULL OR foto_url IS NOT NULL)`. Quando `alerta_origem='chamado'`, a linha é uma mensagem do chamado.
- Service compartilhado `src/services/chamado-mensagens.service.js`: `salvarFotoMensagemChamado(chamadoId, base64)` decodifica data URL, valida tamanho (~4 MB), salva em `uploads/chamados/<id>/<rand>.{jpg|png|webp}`. Mesmo padrão de upload das fotos da O.S.
- Backend cliente (`src/routes/cliente.routes.js`):
  - `GET /cliente/chamados/:id/mensagens` — lista a thread.
  - `POST /cliente/chamados/:id/mensagens` — body `{ texto?, foto_base64? }`, pelo menos um.
- Backend técnico (`src/routes/chamados.routes.js`):
  - `GET /chamados/meus/:id/mensagens` + `POST /chamados/meus/:id/mensagens` simétricos, validando que o chamado é do técnico autenticado (`_tecnicoDoChamado` resolve `tecnicos.usuario_id = req.user.id` + `chamados.tecnico_id`).
- App cliente: novo card "Mensagens" no detalhe do chamado. Thread visual estilo chat (bolhas alinhadas — minhas à direita amber, outras à esquerda). Composer no rodapé com textarea auto-resize, botão de anexar foto (com preview removível) e botão enviar. Foto comprimida com `comprimirFoto(file, 1280, 0.78)` que já existia.
  - **Refinamento posterior:** em chamados `fechado` o card de mensagens some — a avaliação assume esse canal (decisão de produto: cliente já pode escrever no comentário da avaliação, evita duplicação). `_bindMensagensForm` também é pulado nesses casos. Otimização: `/cliente/chamados/:id/mensagens` deixa de ser baixado quando o chamado já está fechado.
  - **Remoção do PDF da O.S.** — botão "📄 Baixar Ordem de Serviço (PDF)" tirado do detalhe (decisão consciente: cliente não recebe a O.S. inicialmente). Função `baixarPdfClienteOS` apagada. Endpoint backend `GET /cliente/ordens-servico/:id/pdf` mantido intocado caso a decisão seja revertida.
- App técnico: **UI implementada (✅ follow-up resolvido)** — em `renderDetalhe` o card "Mensagens do cliente" é inserido entre Telemetria e o bloco antigo "Conversa WhatsApp" (que é coisa diferente — mensagens da conversa que originou o chamado, não a thread do chamado em si). 7 funções com prefixo `td` espelham as do cliente reusando 100% das classes CSS `.cli-msg-*`: `tdRenderMensagensCard`, `tdRenderMensagensList`, `tdRenderMensagemItem`, `tdBindMensagensForm`, `tdEnviarMensagem`, `_tdAtualizarMensagensList`, `_tdAtualizarPreviewFotoMsg`. Estado em `TD.mensagens`, carregado em paralelo com `/chamados/meus/:id` (pulado em fechados). "Minha" = `m.autor_id === TC.user.id` (bolha amber à direita). Placeholder: "Responder ao cliente…". Modo demo simétrico ao cliente.

**✅ Avaliação pós-fechamento (Migration 020):**

Métrica de qualidade do atendimento, só pra olhos do admin.

- Migration `020_chamado_avaliacao.sql`: adiciona em `chamados` as colunas `avaliacao_nota SMALLINT CHECK (1-5)`, `avaliacao_comentario TEXT`, `avaliacao_em TIMESTAMPTZ`.
- `POST /cliente/chamados/:id/avaliar` — body `{ nota: 1-5, comentario? }`. Valida que o chamado está fechado (400 se não) e que ainda não foi avaliado (409 se já). Resposta opaca `{ ok: true }` — não ecoa a nota de volta.
- `GET /cliente/chamados/:id` foi reescrito pra **não expor** `avaliacao_nota`/`comentario`/`em`. Só retorna o boolean derivado `ja_avaliado` (decisão de produto do usuário: cliente envia e some, só admin vê).
- App cliente: card "Como foi o atendimento?" só aparece em chamados `fechados` E `!ja_avaliado`. 5 estrelas clicáveis + comentário opcional + submit. Após enviar, o card vira uma confirmação inline "Obrigado pela avaliação!" que some sozinha em 4s. Re-visitas ao chamado: nenhum card de avaliação aparece (porque `ja_avaliado === true` e o read-only foi removido).
- **Admin desktop: UI implementada (✅ follow-up resolvido)** — duas visualizações:
  - **Card "Avaliação do cliente"** no detalhe do chamado (`renderChDetalhe` em `public/admin.js`), inserido entre Descrição e Informações. Estrelas amber grandes (20px), texto "N de 5", data, e o comentário entre aspas num bloco com borda esquerda amber e fonte itálica. Quando sem comentário: linha cinza "Sem comentário escrito".
  - **Estrelas pequenas (11px) inline na tabela de chamados** ao lado da pílula de status, só em `status === 'fechado'` com `avaliacao_nota != null`. Tooltip `title="Avaliado: N de 5"`. Compacto, não consome coluna nova.
  - Helpers: `_chRenderStars(nota, size)` com tamanhos sm/md/lg e `_chRenderAvaliacaoCard(ch)`. Backend: `GET /chamados/` (lista) ganhou `ch.avaliacao_nota` no SELECT (detalhe já vinha via `ch.*`). CSS novo em `admin.css`: `.ch-stars`, `.ch-star.is-filled`, `.ch-aval-row`, `.ch-aval-coment`, `.ch-aval-inline`. Reusa variáveis `--accent`/`--muted`/`--text`/`--border` do Mission Control.

#### 7H-original — Plano descritivo

Menos crítico que o do técnico, mas valioso pra fidelização. Mesma base do app (mesmo bundle, fluxo decidido pelo role).

- **Tela inicial:** mosaico do condomínio dele — reservatórios (gauges), bombas, alertas abertos, último chamado
- **Abrir chamado** direto pelo app (formulário curto: categoria + descrição + foto opcional)
- **Acompanhar chamado em andamento:** linha do tempo (criado → atribuído → técnico a caminho → no local → concluído) + **mapa com pino do técnico se movendo** quando estiver indo / no local
- **Histórico:** lista de O.S. anteriores com botão "Baixar PDF"
- **Telemetria histórica:** reaproveita gráficos de `cliente.html` já existentes
- Conversa WhatsApp do condomínio: lista de conversas + abrir uma ler (read-only no app — responder só pelo painel admin, decisão consciente: cliente fala com a empresa por WhatsApp normal)

#### 7I — Configurações de notificação e operacional ✅ PARTE A CONCLUÍDA

**Parte A (operacional)** — implementada. **Parte B (push)** depende da 7J (APK).

**Parte A — Aba Operacional (admin master, em `public/admin.html`):**

3 cards na nova tab `cfgBodyOperacional`:

1. **Frequência do GPS** — config `gps.frequencia_segundos` (30–300, default 60). App busca via `GET /tecnicos/config` no login (`aplicarConfigOperacional`) e aplica em `GPS.PING_MS`. Se o watch já estava rodando, reabre pra valer o novo intervalo imediatamente. Sem precisar logout/login.
2. **Retenção do histórico de GPS** — UI da config já existente `gps.retencao_horas` (1–720, default 24). O job `gps-cleanup.job.js` já lê dela.
3. **Alerta de chamado parado** — config `chamados.alerta_atraso_enabled` (boolean, default true) + `chamados.alerta_atraso_horas` (1–24, default 4). Job `chamados-atraso.job.js` roda a cada 15 min, busca chamados `em_atendimento` com `COALESCE(os.chegada_em, ch.atualizado_em)` antigo demais, dispara `sendChamadoAtrasoEmail` (helper novo em `src/services/email.js` com layout amber/⏱), marca `chamados.alerta_atraso_enviado_em` pra anti-spam (re-notifica só após uma janela completa). Botão "▶ Testar verificação agora" chama `POST /admin/jobs/chamados-atraso/run` (master admin) pra disparo manual.

**Migration 021** (`migrations/021_chamados_alerta_atraso.sql`): adiciona `chamados.alerta_atraso_enviado_em TIMESTAMPTZ`. Sem índice (queries do job já cobertas pelos índices de status/atualizado_em).

**Status dos jobs** centralizado: `GET /admin/integracoes/status` agora retorna `job_offline`, `job_gps_cleanup`, `job_leituras_cleanup`, `job_chamados_atraso`.

**Acesso de técnico ao app** (gap operacional resolvido junto):
- Antes: a aba **Técnicos** criava só uma linha em `tecnicos`, sem login; o modal de Usuários em **Configurações** aceitava só `admin`, `admin_viewer`, `cliente` — técnico não conseguia abrir o app.
- Agora: o modal de Técnicos ganhou campo **"Senha do app (opcional)"**. Se preenchido, `POST /tecnicos` cria também o usuário com role `tecnico` e linka via `tecnicos.usuario_id` em uma única transação (helper `_criarUsuarioTecnico` em `src/routes/tecnicos.routes.js`). PATCH segue a mesma lógica: cria login retroativamente ou só troca senha. Email vira obrigatório quando há senha.
- Badge **"✓ Tem login do app"** / "Sem login" no header do modal de edição. `GET /tecnicos` ganhou `tem_login` derivado.
- Whitelist `ROLES` em `admin.routes.js` ganhou `tecnico` (POST/PATCH `/admin/usuarios`). Dropdown do modal de Usuários ganhou opção "Técnico" com hint apontando pra aba Técnicos.

**Bottom nav no app do técnico** (UX gap antigo resolvido):
- Antes o app do técnico tinha só a tela de chamados — sem perfil, sem trocar senha, e logout escondido num botãozinho do header.
- Agora: nav inferior com 2 abas — **Chamados** + **Conta** — reusando a classe `.cli-nav` (sobrescrita pontual `grid-template-columns: repeat(2, 1fr)` quando dentro de `[data-screen^="tecnico"]`).
- Nova tela `tecnico-conta` com 4 blocos: **Seus dados** (avatar+nome+email+especialidade), **Localização (GPS)** (status dinâmico: ativo / fora do expediente 08–18h / aguardando login / desativado em demo, com a janela exibida), **Alterar senha** (POST `/auth/trocar-senha` — endpoint genérico que já existia), botão **Sair** em vermelho.
- Botão de logout no header da tela chamados foi removido (redundante). Funções novas: `abrirTelaContaTec`, `renderContaTec`, `submitTrocarSenhaTec`, `_bindTecnicoUI`.

**Parte B — Push do app (📋 NÃO INICIADA, bloqueada pela 7J):**

- Aba **Notificações** ganha seção "Push do app":
  - Toggle por tipo (alertas críticos / chamados atribuídos / mudanças de status / mensagens WhatsApp)
  - Lista de devices com push ativo + botão "Desativar neste"
  - Janelas de silêncio por usuário (padrão 22h–7h)

Decisão consciente: empacotar primeiro (7J), aí montar a infra de push registro/dispatch (7G), só então plugar a UI da 7I-B.

#### 7J — Publicação nas lojas

- **Android (Play Store):** conta Google Play Developer ($25 uma vez), build assinado via Android Studio, screenshots + descrição + ícone. ~3–7 dias pra aprovação inicial.
- **iOS (App Store):** Apple Developer Program ($99/ano), build via Xcode, TestFlight pra beta, depois review. ~1–2 semanas pra aprovação inicial (Apple é mais rigorosa).
- Versionamento: app reusa o backend de produção — mesma URL, mesmas APIs.
- **Decisão consciente:** começar pelo Android (mais usuários no Brasil + processo mais rápido). iOS num segundo momento.

**Estimativa de tempo realista:** 2–3 semanas pra MVP funcional do app do técnico (7A–7G), +1 semana app do cliente (7H), +1 semana publicação Android (7J). Total: 4–5 semanas até a primeira release real na Play Store.

#### 7K — Página de O.S. no admin + Painel do cliente refeito (Mission Control completo) ✅ CONCLUÍDO

Frente grande que cobriu 6 áreas: criou a página de O.S. faltante no admin e levou o painel do cliente desktop e o app mobile pro mesmo padrão visual do Mission Control. Antes só o admin tinha sido modernizado; cliente ainda usava a estrutura antiga (sidebar com classes legadas, tabela de reservatórios crua, histórico isolado, sem chamados).

**a) Página "Ordens de Serviço" no admin (`public/admin.{html,js,css}`):**

- Nova seção na sidebar (grupo Atendimento, depois de Chamados). Backend (`src/routes/ordens-servico.routes.js`) já existia desde a 7E mas não era exposto na UI.
- 4 KPIs (`.rc`): Total / Finalizadas / Em rascunho / Este mês.
- Toolbar simplificada após primeira iteração: 3 tabs (Todas/Finalizadas/Em rascunho) com contadores + 1 input de busca. Refactor depois de receber feedback de que 5 selects (busca + condomínio + técnico + status + período) era overkill — a busca textual já cobria condomínio e técnico.
- Tabela: Número · Criada em · Condomínio · Técnico · Tipos de serviço (chips amber) · Resultado (pill colorida) · Status · Ações (👁 ver · 📄 PDF).
- **Modal de detalhe** com: identificação, check-in/out + GPS, tipos de serviço (chips grandes), itens verificados, correntes elétricas, resultado + pill, observações, peças (tabela), fotos (grid clicável que abre lightbox), assinatura (img base64).
- **Modo edição** — botão "Editar" no header do modal abre form que aceita: tipos_servico, recebido_nome/tipo, servico_realizado, necessario_retorno + data, observações, orçamento. Salva via `PATCH /ordens-servico/:id`. Backend já permitia admin escrever em O.S. finalizada (middleware `osDonoOuAdmin` pula o check de `forWrite` quando role é admin) — confirmado antes de implementar.
- `/ordens-servico` já estava na lista network-first do SW (`public/sw.js` linha 69), então não precisou mexer.

**b) Painel do cliente desktop — estrutura Mission Control (`public/cliente.{html,js}`):**

A sidebar do cliente estava usando classes pré-redesign (`sidebar-logo`, `nav-item` sem `nav-item-label`, sem `data-label`, sem par `sidebar-brand-full/mini`). Tudo migrado pro padrão idêntico ao admin: par de logos com crossfade (44px expandida / 36px mini), nav items com `data-label` e `nav-item-label`, footer com `sidebar-status` (bolinha verde "Operacional"), botão Sair como `nav-item-logout`. `layout-cli` removido (era variante do Mission Control que sobrescrevia coisa demais). Topbar desktop ganhou estrutura nova (`topbar-toggle` + `topbar-title` + `topbar-actions` com `icon-btn` redondo + `topbar-user`). `showSection` atualiza tanto `topbarTitle` (mobile) quanto `topbarTitleDesktop`. Sidebar começa expandida por padrão (invertido o `localStorage` check).

**c) Página "Alertas" do cliente — modelo Mission Control:**

- 3 KPIs (`.al-kpis.al-kpis-3col` — variante de 3 colunas criada no admin.css): Críticos / Atenção / Total. Os 2 primeiros clicáveis filtram a tab correspondente.
- 3 tabs com contadores (Todos/Críticos/Atenção) + busca + botão Limpar.
- Tabela: Tipo · Mensagem · Severidade (pill colorida) · Aberto há (tempo relativo) · Atualizado.
- Severidade derivada do tipo: `nivel_muito_baixo`/`dispositivo_offline` → crítico; `nivel_baixo` → atenção.
- **Painel lateral** (`.al-painel` em layout `.al-grid 1fr 380px`): click numa linha abre detalhe com banner de reservatório (mini-gauge SVG circular do nível atual), info kv (Severidade/Tipo/Device/Status), mensagem, linha do tempo. Igual o admin, simplificado (sem chamados, sem ações de "marcar resolvido", sem chart histórico — cliente não tem essas permissões).

**d) Página "Chamados" do cliente desktop (~430 linhas JS + 170 CSS):**

Backend já estava todo pronto desde a 7H. Faltava só a UI desktop. Layout estilo "Chamados" do admin (`.ch-layout` lista + painel):

- 3 KPIs (Abertos / Em atendimento / Resolvidos).
- 4 tabs com contadores (Todos/Abertos/Em atend./Resolvidos) + busca + botão "+ Abrir chamado".
- Tabela: ID · Título · Categoria · Prioridade · Status · Data.
- Painel detalhe: header com badges (cat/prio/status), descrição, info da O.S. vinculada (se houver), **timeline 3 passos** (Registrado → Em atendimento → Concluído) com dot verde/amber-pulsante/cinza + linha conectando, bloco de avaliação (CTA quando fechado e não avaliado / "Obrigado pela avaliação" quando já avaliou), **thread de mensagens** estilo chat (bolhas amber à direita = você, cinza à esquerda = técnico) + composer (Enter envia, Shift+Enter quebra linha) — composer some quando chamado fechado.
- Modal "Abrir chamado": categoria (7 opções) + descrição (mín 5 chars). Prioridade auto-derivada no backend.
- Modal "Avaliar": 5 estrelas grandes clicáveis (`.ch-star-btn.is-active` amber) + comentário opcional. Após enviar, refetch detalhe e `ja_avaliado=true` esconde o CTA.
- Polling 20s recarrega quando a tab está ativa.
- Mobile nav ganhou item "Chamados" também.

**e) Telemetria como página única (substitui Histórico) — fallback de propaganda:**

Mudança de modelo de produto: telemetria virou item opcional contratado. Histórico antigo do cliente desktop foi fundido com a parte de reservatórios do Dashboard numa página única "Telemetria":

- Sidebar: "Histórico" → "Telemetria" (gráfico de barras). Dashboard mantém só o resumo (sem mais tabela de reservatórios, que migrou).
- 4 KPIs (`.al-kpis.al-kpis-4col` — variante criada): Reservatórios / Online / Alertas / Última leitura (tempo relativo).
- **Linha 1** (1.6fr / 1fr) — espelha o admin:
  - **Bar chart ApexCharts** "Níveis dos reservatórios" — uma barra por reservatório com cores graduadas (vermelho <20% / amber <40% / ciano <70% / verde) e gradient vertical.
  - Card "Em atenção" — lista priorizada de reservatórios offline / com nível baixo / com alertas (top 8).
- **Linha 2** (1.4fr / 1fr):
  - **Area chart ApexCharts** "Histórico de níveis" com gradient amber + **annotations** "Atenção 45%" e "Crítico 20%" (no lugar dos datasets fake do Chart.js antigo). Ranges 24h/7d/30d/90d (`.tel-range-btn`). Botão PDF reusa endpoint existente.
  - Tabela "Status das bombas" com pills "LIGADA" verde com glow / "DESLIGADA" cinza / "—".
- **Fallback `#telCliFallback`** quando `data.reservatorios.length === 0`: card central com ícone amber, título "Você ainda não tem telemetria contratada", parágrafo explicativo, lista de 4 benefícios (com check verde), botão amber "Quero saber mais" linkando pra WhatsApp + nota "Resposta rápida pelo WhatsApp".
- Dependência nova carregada no `<head>`: `apexcharts.min.js` (já existia em `/static/` mas o cliente não usava).
- Toda a estilização reaproveita classes `.tel-row`, `.tel-niveis-chart`, `.tel-crit-row`, `.tel-bombas-table`, `.tel-historico-ctrls/-chart` que já existiam no `admin.css` — zero CSS específico do cliente (exceto as 2 variantes de grid `al-kpis-3col`/`al-kpis-4col`).

**f) App mobile — fallback de propaganda + telemetria enriquecida (`app/public/app.{js,css}`):**

- Aba **Telemetria** quando `reservatorios.length === 0` → mostra propaganda tela cheia (`_renderClienteSemTelemetria({ contexto: "tela" })`) com ícone amber, título, parágrafo, lista de benefícios, CTA WhatsApp e nota.
- Home quando sem telemetria: KPI "Offline" some (não faz sentido sem reservatório) e card "Reservatórios" é substituído pelo mesmo bloco de propaganda em variante compacta (`contexto: "home"`).
- Aba Telemetria foi enriquecida — antes só tinha chips + chart. Agora mostra (top→bottom): 4 KPIs Mission Control compactos (2x2) → mini-cards de reservatórios atuais (`renderReservCard` reusado da home) → lista "Status das bombas" com pills coloridas → chart histórico Chart.js (mantido).
- **Bug do flash de propaganda corrigido**: `CLI.statusCarregado` vira `true` só após primeira resposta de `/cliente/status`. Antes, race com `/cliente/chamados` (que é mais leve e resolve antes) chamava `renderClienteHome` com `reservatorios=[]` (estado default) e mostrava propaganda por ~500ms até o status chegar.
- **Splash estendido**: `abrirTelaCliente` virou async — força `showScreen("splash")` no início e só troca pra `cliente-home` depois que `Promise.all([carregarClienteStatus, carregarClienteChamados])` resolve. Logo da General fica visível até a tela estar populada, sem flash de "Carregando…" intermediário.

**g) Timeline (linha do tempo) — alinhamento corrigido:**

A linha vertical conectando as 3 bolinhas do detalhe do chamado tinha dois bugs (visíveis quando o título de algum step quebrava em várias linhas):

- **Desktop** (`.ch-tl-step` em `admin.css`): coluna do grid 20px, dot 18px sem `justify-self` → dot ficava em x=0..18 (centro x=9), linha em `left:9 width:2` (centro x=10). 1px de offset. Linha tinha `height: calc(100% + 4px)` com `top:18` → terminava 8px DENTRO do próximo dot (gap=14, sobra=18+4-14). Corrigido: dot pra 20px com `justify-self: center` (centra na coluna independente de width futura), linha `top:24 bottom:-10` (4px de respiro depois do dot e 4px antes do próximo).
- **Mobile** (`.cli-tl-item` em `app.css`): linha `top:32` sobrepunha 4px do bottom do dot (que vai até y=36 com padding-top 8 + dot 28). Corrigido pra `top:40 bottom:0` (4px depois do dot, termina no fim do item, 12px antes do próximo dot por causa do padding + gap natural).

**h) Orçamentos avulsos — polimento e PDF com papel timbrado ✅ CONCLUÍDO:**

Melhorias na página de orçamentos independentes (avulsos) do admin, que havia sido criada nos commits anteriores da Fase 7K.

**Modal full-screen (substituiu side panel 380px):**
- `#avModal` com `.av-modal-backdrop` (blur + overlay escuro) e `.av-modal-dialog` (fundo sólido `#0e1022`, max-width 900px, animação de entrada)
- Botão fechar reposicionado para canto superior direito do dialog
- Removido o antigo `<aside id="avPainel">`

**Numeração automática:**
- Usa a sequence `orcamento_numero_seq` (já existia na migration 025 mas não era usada)
- Formato `OR-000001`, `OR-000002`… via `nextval` no Postgres
- Campo de número saiu do formulário (só leitura)

**Vinculação a O.S. (migration 027):**
- `ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS os_id INTEGER REFERENCES ordens_servico(id) ON DELETE SET NULL`
- Modal ganha select "O.S. vinculada" que carrega as O.S. do condomínio selecionado via `GET /admin/condominios/:id/historico`
- PATCH envia `os_id`; GET lista retorna `o.os_id, os.numero AS os_numero` via LEFT JOIN

**Histórico por condomínio no painel lateral (drawer):**
- Novo endpoint `GET /admin/condominios/:id/historico` retorna `{ os: [...], orcamentos: [...] }`
- Duas novas abas no drawer existente: "O.S." e "Orçamentos"
- `_drawerHistorico` com cache por `condoId` — não recarrega ao trocar de aba
- Botão "Ver histórico completo" (substituiu "Ver telemetria completa") na tela de detalhe do cliente no painel lateral
- Colunas corretas da tabela `ordens_servico`: `finalizada_em` (não `fechado_em`), `servico_realizado` (não `descricao`), sem coluna `status` — derivado no frontend a partir de `finalizada_em`

**PDF com papel timbrado:**
- `papel-timbrado.png` (A4 completo com logo, marca d'água de engrenagem e rodapé da empresa) lido como base64 em `timbradoBase64()`
- Fundo full-page via `<div class="timbrado-bg" style="background-image:url('...')">` com `position: fixed; inset: 0; background-size: 100% 100%; -webkit-print-color-adjust: exact`
- Margens do Puppeteer zeradas (`top/right/bottom/left: "0"`) — espaçamento feito via `padding: 44mm 20mm 32mm 20mm` no `body` do HTML gerado (margens do Puppeteer recortam a área de `position: fixed`, causando imagem pequena no centro se não zeradas)
- Removidos `.header` programático (logo + "ORÇAMENTO" + linha âmbar) e `.rodape` de texto (o timbrado já tem essas informações)
- Número + data do orçamento aparecem como `.doc-info` no canto direito dentro da área de conteúdo
- `displayHeaderFooter: false` (o timbrado já tem rodapé com endereço/telefone da empresa)

**Fix auth PDF:**
- `window.open(url)` não envia header `Authorization: Bearer` → retorna 401
- Substituído por `fetch(url, {headers: authHeaders()})` → `r.blob()` → `URL.createObjectURL(blob)` → clique programático em `<a>` invisível
- Aplicado em `_avAcao("gerar-pdf")` (avulsos) e `_orcGerarPdf()` (O.S.)

**Pendências conhecidas:** nenhuma — telefone real `5511966536110` já está em `public/cliente.html` (2 lugares) e `app/public/app.js`.

---

### Fase 8 — Analytics e SLA 📋 PLANEJADA

Dashboards focados em **prestação de contas** — tempo de resposta, taxa de resolução, SLA por prioridade. Hoje os números existem espalhados nos relatórios; a Fase 8 organiza em métricas auditáveis.

#### 8A — Métricas de tempo (base) ✅ CONCLUÍDO

**Migration `022_chamados_sla.sql`:** 2 colunas em `chamados`:
- `primeira_resposta_em` (timestamptz) — quando alguém da equipe interagiu pela primeira vez
- `tempo_resolucao_seg` (int) — segundos entre `criado_em` e fechamento
- **Backfill** automático: `tempo_resolucao_seg` calculado pra chamados já fechados a partir de `fechado_em - criado_em`
- Index parcial `idx_chamados_sla (criado_em DESC) INCLUDE (status, prioridade, condominio_id, primeira_resposta_em, tempo_resolucao_seg)` cobrindo o GET de SLA

**Redefinição prática de `primeira_resposta_em`:** o plano original dizia "primeiro `direcao=saida`", mas na prática chamados podem nascer sem conversa (cliente app ou admin manual). Decisão: **primeiro evento da equipe sobre o chamado**, capturado via `COALESCE(primeira_resposta_em, NOW())` em 4 hooks:
- `POST /chamados/:id/iniciar-atendimento` (técnico inicia)
- `PATCH /chamados/:id` (admin muda pra qualquer status ≠ aberto)
- `POST /chamados/meus/:id/mensagens` (técnico responde no thread)
- `POST /alertas/comentarios` quando `origem='chamado'` (admin comenta)

**`tempo_resolucao_seg`** preenchido em 2 hooks de fechamento via `GREATEST(0, EXTRACT(EPOCH FROM (NOW() - criado_em))::int)`:
- `PATCH /chamados/:id` com `status='fechado'` (admin) — reabertura zera o campo pra recalcular
- `POST /ordens-servico/:id/finalizar` (técnico fecha via O.S.)

**View materializada `chamados_metricas` — descartada por enquanto.** Volume de chamados no MVP não justifica o overhead. Query direta com `PERCENTILE_CONT` cobre os KPIs. Materializar fica fácil depois (índice já está pronto).

**Endpoint `GET /relatorios/sla-metricas`** com filtros `data_ini/data_fim/condominio_id/prioridade`. Retorna mediana + média de TTFR e TTR, % resolvidos em < 1h, % reabertos pendentes + contagens auxiliares (`total`, `fechados`, `com_resposta`).

**UI na aba Insights** (Relatórios → Insights): nova seção "Métricas de SLA · tempo de resposta e resolução" abaixo dos KPIs existentes. 4 cards `.rc` com cor adaptativa por thresholds (TTFR ≤ 30min ok / ≤ 2h warn / > 2h bad; TTR ≤ 2h ok / ≤ 8h warn; resolvidos < 1h ≥ 60% ok / ≥ 30% warn; reabertos = 0% ok / ≤ 10% warn). Subtitle contextual nos cards (ex: "mediana · 12 de 30 chamados").

**Helper `_relKpiCard` estendido** com 5º parâmetro `subtitle` opcional + 2 novos SVGs (`_SVG_BOLT` e `_SVG_REVERT`). CSS novos `.rc-sub`, `.rel-sla-section`, `.rel-sla-head`, `.rel-sla-empty`.

**Limitação consciente — `% reabertos`:** sem audit log de transições de status, a métrica só captura "chamados que foram fechados e estão abertos agora" (`fechado_em IS NOT NULL AND status <> 'fechado'`). Chamados que reabriram e foram refechados não entram na conta. Quando virar 8B (SLA configurável) ou 8C (dashboard dedicado), adicionar log dedicado de transições corrige isso.

#### 8B — SLA configurável ✅ CONCLUÍDO

- Migration `023_sla_definicoes.sql`: `sla_definicoes(prioridade, ttfr_min, ttr_min)` com seeds (emergência: 5min/30min, alta: 15min/2h, média: 1h/8h, baixa: 4h/24h)
- Editável pelo master admin em **Configurações > SLA** (nova aba) — tabela inline com inputs numéricos + botão "Salvar" por linha
- `GET /admin/sla` e `PATCH /admin/sla/:prioridade` (master admin)
- `GET /chamados` faz LEFT JOIN com `sla_definicoes`: calcula `sla_ttfr_estourado` (sem 1ª resposta + passou ttfr_min) e `sla_ttr_risco` (não fechado + passou ttr_min) por chamado em tempo real
- Badge vermelho "⚠ SLA" e badge âmbar "⏱ TTR" na tabela de chamados e no painel lateral de detalhe
- Aba SLA oculta para admin_viewer (só master admin)
- Push (Fase 7) e email opcionais ficam para a 8C/8D

#### 8C — Dashboard de SLA ✅ CONCLUÍDO

Nova aba **"Dashboard SLA"** em Relatórios (ao lado de Insights).

**Backend** (`GET /relatorios/sla-dashboard`): 4 queries em paralelo retornando:
- `kpis`: % no SLA (TTFR), TTFR/TTR medianos, chamados em risco (≥ 50% TTR usado), violações de TTFR
- `ttr_por_dia`: série temporal (TTR médio por dia) para o line chart
- `por_tecnico`: performance por técnico (total, TTFR/TTR médios, % no SLA, nota de avaliação)
- `em_risco`: chamados abertos com ≥ 50% do TTR consumido — estado atual, independente de filtro de data

**UI:**
- Filtros: período (ini/fim) + condomínio + prioridade + botão Gerar
- 4 KPI cards com cor adaptativa (ok/warn/bad)
- Line chart "TTR médio ao longo do tempo" em amber com botões 30/60/90 dias que recarregam os dados
- Tabela "Performance por técnico" com badge colorido de % no SLA
- Tabela "Chamados em risco" com barra de progresso colorida (azul → âmbar → vermelho conforme % do TTR)

**Exportar PDF** fica para 8D (depende de histórico longo de leituras para relatório mensal completo).

#### 8D — Histórico longo de leituras (gráficos > 7 dias) ✅ CONCLUÍDO

`/admin/historico` passou a suportar buckets diários quando `horas > 168` (> 7 dias), consultando direto a tabela `leituras` com `DATE_TRUNC('day', criado_em)` — dentro dos 60 dias garantidos pela retenção (9C). Sem necessidade de tabelas agregadas (9A/9B/9D descartadas).

---

### Fase 9 — Histórico longo + retenção ✅ MVP CONCLUÍDO (9C apenas)

A tabela `leituras` cresce ~1 linha por device por 5 min. Em 100 condomínios com 3 reservatórios cada, são ~86k linhas/dia. Em 6 meses, o Railway começa a doer.

**Decisão de escopo:** o usuário confirmou que histórico > 60 dias **não é necessário** no produto. Isso elimina a complexidade de tabelas agregadas e roteamento de queries — basta política de retenção. **9A, 9B e 9D ficam descartadas** (não fazer); fica só a 9C, implementada como descrito abaixo. Se um dia precisar mostrar gráficos > 60 dias, agregar fica fácil porque o desenho original em camadas continua válido.

#### 9C — Política de retenção ✅ CONCLUÍDO

**Job (`src/jobs/leituras-cleanup.job.js`):**
- `setTimeout` recursivo (padrão do projeto, igual `gps-cleanup.job.js` e `offline.job.js`): roda 1×/dia. Primeira execução **10 minutos após boot** (mais tarde que o GPS pra não disputar pool no startup).
- `DELETE FROM leituras WHERE id IN (SELECT id FROM leituras WHERE criado_em < NOW() - X days LIMIT 10000)` — apaga em **lotes de 10k** pra não segurar locks longos nem inchar o WAL.
- **Cap de segurança: 200 lotes** (2M linhas) por execução. Se atingir, marca `truncado: true` no resultado e o admin vê aviso amarelo "Atingiu o limite de lotes — talvez precise rodar de novo".
- **Hard floor de 7 dias** — se a config vier abaixo disso, usa 7. Protege contra erro de digitação que apagaria tudo.

**Config (`src/services/config.service.js`):** 2 chaves novas na whitelist:
- `leituras.retencao_dias` (int 7–3650, default 60)
- `leituras.cleanup_dry_run` (boolean)

**Modo dry-run:** quando `leituras.cleanup_dry_run = "true"`, o job faz só `SELECT COUNT(*)` e retorna `seriam_removidos: N` sem apagar. Permite confirmar volume na primeira execução em produção antes de soltar o DELETE.

**Backend endpoints (`src/routes/admin.routes.js`):**
- `GET /admin/integracoes/status` ganhou `job_gps_cleanup` e `job_leituras_cleanup` no response (última execução + último resultado).
- `POST /admin/jobs/leituras-cleanup/run` (master admin) — dispara a limpeza na hora. Respeita o `dry_run` da config. Útil pra testar sem esperar 24h.

**UI admin (`public/admin.html` + `public/admin.js` + estilos reusados de `.cfg-card`):** nova aba **Configurações > Manutenção** (só master admin). Dois cards:
- **"Limpeza de leituras antigas"**: input numérico de dias (mín 7, máx 3650), checkbox "Modo seguro (só conta, não apaga)" com explicação, botão "▶ Rodar agora" e "Salvar".
- **"Última execução"** (só aparece depois da primeira run): quando, modo (seguro/real), linhas removidas com separador de milhar, lotes, duração em segundos, retenção configurada, aviso amarelo se truncado.
- **Confirm dialogs** com mensagem diferente conforme dry-run: modo seguro = "Rodar em modo seguro?", modo real = "Vai APAGAR de verdade. Tem certeza?" (texto enfático em maiúsculas).

**Estimativa de impacto:**
- Sem limpeza: ~3,6 GB/ano crescendo pra sempre. Em 2 anos pesa ~7 GB.
- Com limpeza 60 dias: estabiliza em ~5,2M linhas = **~600 MB**, independente do tempo de operação.

**Plano de rollout (passos manuais sugeridos):**
1. Antes do primeiro deploy real, ligar dry-run na config.
2. Chamar `POST /admin/jobs/leituras-cleanup/run` → conferir `seriam_removidos: N`.
3. Desligar dry-run via UI.
4. Rodar de novo → apaga de verdade.
5. Daí em diante: roda sozinho 1×/dia.

#### 9E — Limpeza retroativa de alertas e conversas antigas ✅ CONCLUÍDO

Decisão consciente: **só deletar** (sem tabelas `*_arquivados`). Quem precisar de histórico longo consulta Relatórios. O WhatsApp do cliente e a Evolution API mantêm o histórico independentemente — nosso DELETE só apaga a cópia local.

**Jobs (`src/jobs/alertas-cleanup.job.js` + `conversas-cleanup.job.js`):**
- Mesmo padrão de `leituras-cleanup` (setTimeout recursivo, 1×/dia, hard floor, lotes pequenos, MAX_LOTES de segurança, dry-run).
- Primeira execução 15min (alertas) e 20min (conversas) após boot — escalonado pra não disputar pool com gps-cleanup e leituras-cleanup.
- **Alertas:** `WHERE status='resolvido' AND atualizado_em < NOW() - N days`. CTE com 2 DELETEs no mesmo round-trip apaga `alerta_comentarios WHERE alerta_origem='telemetria'` daqueles alertas (sem FK direta — viraria órfão se não fosse junto). Lotes de 1000.
- **Conversas:** `WHERE status='fechada' AND fechado_em < NOW() - N days`. `mensagens_whatsapp` cascateia via FK (migration 001), `chamados.conversa_id` vira NULL via SET NULL. CTE também conta mensagens afetadas pra reportar no resultado. Lotes de 500.

**Config (whitelist em `config.service.js`):** 4 chaves novas, hard floor de 30 dias, default 365:
- `alertas.retencao_dias` (int 30–3650) + `alertas.cleanup_dry_run` (bool)
- `conversas.retencao_dias` (int 30–3650) + `conversas.cleanup_dry_run` (bool)

**Endpoints novos:**
- `POST /admin/jobs/alertas-cleanup/run` + `POST /admin/jobs/conversas-cleanup/run` (master admin, dispara imediato respeitando dry-run)
- `GET /admin/integracoes/status` ganhou `job_alertas_cleanup` e `job_conversas_cleanup`

**UI Manutenção:** 4 cards novos (config + "última execução" pra cada job). Card de conversas tem aviso explícito: "Não mexe no WhatsApp do cliente — só na cópia que aparece na central de atendimento aqui." Confirm dialog diferencia dry-run de delete real, com texto enfático no modo real.

**Sem migration nova** — colunas usadas já existiam (`alertas.status`+`atualizado_em` e `conversas_whatsapp.status`+`fechado_em`).

#### 9A — Tabela agregada horária ❌ DESCARTADA

Mantido aqui pra referência caso a decisão de escopo mude.

- Migration `013_leituras_agregadas.sql`: `leituras_agregadas_hora(device_id, hora_truncada, nivel_pct_min, nivel_pct_max, nivel_pct_avg, bomba_pct_ligada, n_amostras)`
- Job em `cron` (ou setTimeout recursivo, padrão do projeto): a cada hora, agrega leituras da **última hora fechada** e insere idempotente (`ON CONFLICT (device_id, hora_truncada) DO UPDATE`)
- Reaproveita o `config.service.js` pra ligar/desligar o job e ajustar intervalo

#### 9B — Tabela agregada diária ❌ DESCARTADA

- `leituras_agregadas_dia` populada a partir da horária (mais barato que da raw)
- Permite gráficos de 30/90/180 dias sem ler milhões de linhas

#### 9D — Adaptar queries existentes ❌ DESCARTADA

- `GET /admin/historico` ganha lógica:
  - `horas <= 168` (7 dias) → lê de `leituras` (raw)
  - `horas > 168 && horas <= 720` (30 dias) → lê de `leituras_agregadas_hora`
  - `horas > 720` → lê de `leituras_agregadas_dia`
- Chave: o frontend não sabe da diferença — apenas o endpoint serve granularidade adequada

---

### Fase 10 — Treinar IA com histórico 📋 PLANEJADA

A IA hoje usa um `system_prompt` genérico (Fase 6D deixou ele editável). Conforme o sistema acumula conversas reais resolvidas com bom atendimento humano, dá pra **especializar a IA no domínio** — vocabulário do morador, tipos de problema típicos, gírias regionais, padrões de "o que normalmente é só susto vs. emergência real".

**Pré-requisito de volume:** ~500+ conversas resolvidas com avaliação humana (bom/ruim). Antes disso, few-shot puro já melhora muito.

#### 10A — Curadoria de conversas resolvidas

- Coluna nova `conversas_whatsapp.qualidade_atendimento` (enum: `excelente` / `boa` / `aceitavel` / `ruim` / `null`) — preenchida manualmente pelos admins no painel
- Migration `014_qualidade_conversas.sql` + UI: dropdown no painel direito de WhatsApp ao fechar conversa ("Como foi este atendimento?")
- Export `GET /admin/conversas/export?qualidade=excelente,boa&desde=...` — JSONL com pares (entrada do cliente → resposta humana ou da IA aprovada)
- **PII scrubbing automático** no export: regex pra CPF, telefone, endereço completo → tokens `[CPF]`, `[FONE]`, etc.

#### 10B — Few-shot por categoria

- Tabela `ia_exemplos(categoria, mensagem_cliente, resposta_ideal, criado_por, ativo)`
- Editável em **Configurações > IA** (nova sub-aba "Exemplos") — master admin promove conversas reais a exemplos curados
- `ia.service.js` injeta 2-3 exemplos relevantes no `messages[]` baseado em **classificação prévia** (1ª chamada barata classifica → 2ª chamada com exemplos da categoria)
- Cache: classificação fica em `mensagens_whatsapp.ia_categoria`, já existe

#### 10C — Avaliação A/B (com vs sem few-shot)

- Toggle em **Configurações > IA**: "% de tráfego com few-shot" (0-100)
- Log de cada chamada: `ia_chamadas_log(conversa_id, com_few_shot, modelo, tokens_in, tokens_out, latencia_ms, custo_usd)`
- Dashboard simples (em Insights): comparativo de qualidade média (vinda da Fase 10A) entre os dois ramos
- Se ganho for marginal, **não vale o custo** — manter prompt simples

#### 10D — Fine-tuning (só se 10B/C indicar que vale)

- OpenAI permite fine-tuning de `gpt-4o-mini` com JSONL no formato `{messages: [...]}`
- Custo: ~3-5x mais caro por token de inferência, mas reduz tokens do prompt (não precisa enviar exemplos toda vez)
- **Critério de decisão:** só vale se few-shot do 10B já estiver dando ganho consistente E o volume de conversas/mês justificar (>10k mensagens IA/mês)
- Pipeline: export JSONL curado (10A) → upload pra OpenAI → cria fine-tune → endpoint troca modelo via config dinâmica (Fase 6D já permite trocar modelo sem deploy)
- Versionamento: cada fine-tune é um `ft:gpt-4o-mini:...:abc123` — guardar histórico em `ia_modelos_fine_tune` com data, qualidade média, custo

#### 10E — Guardrails contra deriva

- Avaliações automáticas mensais: rodar a IA fine-tuned em ~50 conversas "ouro" (curadas como referência) e comparar resposta vs. resposta humana real
- Se taxa de divergência > X%, alerta no painel pra reavaliar
- Botão "Rollback rápido" em **Configurações > IA** pra voltar ao modelo base se algo der errado em prod

---

## Variáveis de ambiente novas necessárias

```env
EVOLUTION_API_URL=https://sua-evolution-api.com
EVOLUTION_API_KEY=chave-da-evolution-api
EVOLUTION_WEBHOOK_TOKEN=token-secreto-do-webhook
EVOLUTION_INSTANCE=nome-da-instancia
OPENAI_API_KEY=sk-...
```

---

## O que NÃO muda no projeto atual

- Toda a estrutura de telemetria existente
- Autenticação JWT e middlewares
- Painel admin/cliente atual
- Tabelas existentes (condominios, reservatorios, leituras, alertas, usuarios)
- Sistema de alertas e email

---

### Fase 11 — Política de Criticidade P1-P4 e SLA de chegada ✅ CONCLUÍDO

#### Contexto

Substituição da nomenclatura antiga (`emergencia/alta/media/baixa`) por níveis P1-P4 com SLA de chegada do técnico (não de resolução).

#### Regras de Classificação

**Fórmula:** Criticidade = Risco Técnico + Impacto Operacional + Recorrência + Estratégia do Cliente + Urgência Real

| Nível | SLA chegada | Descrição |
|---|---|---|
| P1 CRÍTICO | ≤ 3h | Condomínio não pode esperar |
| P2 ALTA | 24–48h | Funciona parcialmente, risco de agravar |
| P3 CONTROLADO | ≤ 72h | Cabe na agenda |
| P4 AGENDADO | Conforme agenda | Sem urgência |

**Fluxo de triagem (pare no primeiro SIM):**
- Q1: Sem água, alagando, esgoto, queimado, risco incêndio? → P1
- Q2: Modo parcial, contingência, manual, redundância comprometida? → P2
- Q3: Funciona normalmente, precisa de inspeção ou pequena correção? → P3
- Q4: Preventiva, projeto, retrofit, orçamento, instalação planejada? → P4

**Regra de desempate:** dúvida entre dois níveis → prevalece o MAIOR.

**Regras especiais:**
- Redundância SÓ reduz criticidade se a contingência está realmente funcionando
- Falha recorrente (mesma falha no mês) sobe um nível automaticamente
- Drenagem em manual sem operador com chuva prevista = P1
- SLA mede chegada do técnico, NÃO resolução

#### Status de implementação

- [x] Migration 028: renomear valores `emergencia→p1`, `alta→p2`, `media→p3`, `baixa→p4`; atualizar `sla_definicoes` com novos tempos; adicionar `tecnico_a_caminho_em` e `tecnico_chegou_em` em `chamados`
- [x] chamados.routes.js — `PRIORIDADES` atualizado, endpoints `/a-caminho` e `/chegou`, detecção de recorrência
- [x] cliente.routes.js — `CATEGORIA_PRIORIDADE` remapeado para p1-p4
- [x] admin.routes.js — `PRIORIDADES_ORDEM` e ordenação atualizados
- [x] ia.service.js — enum e descrições para p1-p4
- [x] offline.job.js — `'alta'` → `'p2'`
- [x] admin.js + admin.css — mapas renomeados, classes CSS atualizadas, donut P1-P4 no Dashboard SLA
- [x] app.js + app.css — `PRI_RANK`/`PRI_LABEL` para p1-p4, botões "A caminho" e "Chegou"

---

## Backlog — Análise de Schema

### Concluídos

#### 1. Sistema de orçamentos unificado ✅ CONCLUÍDO (Migration 030)

Antes coexistiam dois sistemas paralelos: 12 colunas `orcamento_*` em `ordens_servico` + tabela `orcamento_itens` (sistema A, migrations 018/024/025) e tabelas `orcamentos`/`orcamento_linhas` (sistema B, migrations 026/027).

**Migration 030 (`unificar_orcamentos.sql`), em transação:**
- Adicionou em `orcamentos` as colunas que só existiam no sistema A: `valor`, `aprovado_em`, `aprovado_por`, `motivo_rejeicao`
- Backfill: pra cada OS com `orcamento_necessario=true` que ainda não tinha registro em `orcamentos`, criou um. Status `pendente` → `rascunho`, demais 1:1. Moveu `orcamento_itens` → `orcamento_linhas`
- Dropou 12 colunas formais de `ordens_servico` e a tabela `orcamento_itens`
- **Mantém em `ordens_servico`**: `orcamento_necessario` BOOLEAN e `orcamento_observacoes` TEXT — esses são input do técnico no app (semente do orçamento formal)

**Backend refatorado:**
- `admin.routes.js`: as rotas `/admin/orcamentos/:os_id/*` mantêm `:os_id` na URL por compat com o frontend, mas internamente resolvem `orcamento_id` via helper `_garantirOrcamentoDaOs` (cria registro em `orcamentos` se ainda não existir, com número sequencial OR-XXXXXX). Response usa aliases `orcamento_*` pro frontend não precisar de mudanças amplas
- `orcamento-pdf.service.js`: removida função `gerarPdfOrcamento` (sistema A); o endpoint `/orcamentos/:os_id/pdf` agora resolve o `orcamento_id` da OS e chama `gerarPdfAvulso` com a mesma normalização que já existia
- `GET /admin/condominios/:id/historico`: agora faz LEFT JOIN com `orcamentos` em vez de ler colunas da OS

**Frontend:**
- Status "pendente" no banco virou "rascunho" — filtros, KPIs e badge da sidebar mapeiam o nome de tab `pendente` ao valor `rascunho` no banco, label do usuário continua "PENDENTE" pra não confundir
- `_orcStatusCls/_orcStatusLabel` ganharam variante `enviado` (nova possibilidade do sistema unificado)

### Redundâncias confirmadas (pendentes)

**FK bidirecional chamados ↔ ordens_servico**
- `chamados.ordem_servico_id` → ordens_servico
- `ordens_servico.chamado_id` → chamados
- Uma direção é suficiente; `chamados.ordem_servico_id` é redundante

**`responsavel_id` vs `tecnico_id` em chamados**
- `responsavel_id` → usuarios (admin acompanhador, populado/lido em chamados/cliente/relatorios)
- `tecnico_id` → tecnicos (quem executa em campo)
- Não está morto — semântica distinta; decidir se vale unificar ou só documentar

#### 2. `mensagens_whatsapp.ia_urgencia` em p1-p4 ✅ CONCLUÍDO (Migration 031)

Coluna criada na migration 001 com CHECK `('baixa','media','alta','emergencia')`. Fase 11 padronizou tudo em p1-p4 mas essa ficou pra trás. Em produção: 12 mensagens, todas NULL — só o constraint precisava trocar, UPDATE foi defensivo.

- Migration `031_ia_urgencia_p1p4.sql`, em transação: DROP CONSTRAINT antigo → UPDATE mapeando `emergencia→p1, alta→p2, media→p3, baixa→p4` → ADD CONSTRAINT novo aceitando `NULL` ou `p1-p4`
- UI (`public/admin.js`): badge de urgência no card de resumo da IA passou a usar helpers `_waUrgenciaLabel/_waUrgenciaCor/_waUrgenciaBg` → mostra `CRÍTICO` (vermelho), `ALTA` (amber), `CONTROLADO` (amarelo), `AGENDADO` (cinza) em vez do código cru

### Tabelas faltando (por prioridade de impacto)

**1. `planos_manutencao` — alta prioridade**
- Todo condomínio tem contrato preventivo mas não há gestão disso no banco
- Permitiria: gerar P4 automaticamente quando vence, dashboard de compliance preventivo
- Colunas sugeridas: `condominio_id`, `titulo`, `periodicidade_dias`, `proxima_em`, `ultima_em`, `tecnico_responsavel_id`, `ativo`

**2. `equipamentos` — média prioridade**
- Só `reservatorios` é rastreado; bombas, motores, painéis não têm identidade no sistema
- Sem isso: `os_pecas` registra "trocou bomba X" mas não vincula ao equipamento físico
- Colunas sugeridas: `condominio_id`, `tipo`, `marca`, `modelo`, `numero_serie`, `instalado_em`, `garantia_ate`

**3. `historico_chamados` — média prioridade**
- Só o estado atual é salvo; não dá ver quem alterou prioridade/status nem quanto tempo cada fase durou
- Essencial para relatórios SLA ricos e accountability
- Colunas sugeridas: `chamado_id`, `campo_alterado`, `valor_anterior`, `valor_novo`, `alterado_por`, `alterado_em`

**4. `contratos` — média prioridade**
- Sistema sabe que todo condomínio é cliente com contrato, mas não guarda valor, vigência, tipo de plano
- Sem isso não há alertas de renovação nem relatório de receita recorrente
