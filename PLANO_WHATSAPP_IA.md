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
