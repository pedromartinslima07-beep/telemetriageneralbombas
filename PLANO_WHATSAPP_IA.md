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

#### 7A — Estrutura do app + Capacitor setup

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

#### 7B — Autenticação e onboarding

- Reusa endpoints existentes (`POST /auth/login` + JWT). Sem reescrever auth.
- **Trusted device** do app é mais permissivo que web: token salvo em `Capacitor Preferences` (storage nativo criptografado), válido por 30 dias
- Tela de login com biometria (Touch ID / Face ID / impressão digital) via `@capacitor-community/biometric-auth`
- OTP via WhatsApp (já implementado pro web) também roda no app — usa deep link `general-bombas://otp?code=...`

#### 7C — Tela inicial do técnico

- **Lista de chamados atribuídos** (filtro `responsavel_id = me` em `/chamados`)
- Cada card: condomínio, endereço, prioridade (badge), categoria, tempo aberto, distância (Haversine entre GPS atual e `condominios.lat/lng`)
- Ordenação configurável: **proximidade** (default) / prioridade / data
- 3 tabs: **Hoje** (atribuídos não concluídos) / **Próximos** (agendados) / **Histórico** (concluídos)
- Botão flutuante "🔄" pra forçar refresh + indicador de quando foi o último sync

#### 7D — Tela do chamado + ciclo de atendimento

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

#### 7E — Ordem de Serviço digital (substitui o formulário paper atual)

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

#### 7F — Rastreamento GPS dos técnicos

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

#### 7G — Push notifications nativas

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

#### 7H — App do cliente / síndico

Menos crítico que o do técnico, mas valioso pra fidelização. Mesma base do app (mesmo bundle, fluxo decidido pelo role).

- **Tela inicial:** mosaico do condomínio dele — reservatórios (gauges), bombas, alertas abertos, último chamado
- **Abrir chamado** direto pelo app (formulário curto: categoria + descrição + foto opcional)
- **Acompanhar chamado em andamento:** linha do tempo (criado → atribuído → técnico a caminho → no local → concluído) + **mapa com pino do técnico se movendo** quando estiver indo / no local
- **Histórico:** lista de O.S. anteriores com botão "Baixar PDF"
- **Telemetria histórica:** reaproveita gráficos de `cliente.html` já existentes
- Conversa WhatsApp do condomínio: lista de conversas + abrir uma ler (read-only no app — responder só pelo painel admin, decisão consciente: cliente fala com a empresa por WhatsApp normal)

#### 7I — Configurações de notificação e operacional

- Aba **Operacional** em Configurações (admin master):
  - Frequência do GPS tracking dos técnicos (30s–5min)
  - Retenção do histórico de localização (1–7 dias)
  - Tempo máximo de chamado em `em_atendimento` antes de alerta (default 4h — se passar, admin recebe push "Técnico X está há 4h+ no chamado Y")
- Aba **Notificações** ganha seção "Push do app":
  - Toggle por tipo (alertas críticos / chamados atribuídos / mudanças de status / mensagens WhatsApp)
  - Lista de devices com push ativo + botão "Desativar neste"
  - Janelas de silêncio por usuário (padrão 22h–7h)

#### 7J — Publicação nas lojas

- **Android (Play Store):** conta Google Play Developer ($25 uma vez), build assinado via Android Studio, screenshots + descrição + ícone. ~3–7 dias pra aprovação inicial.
- **iOS (App Store):** Apple Developer Program ($99/ano), build via Xcode, TestFlight pra beta, depois review. ~1–2 semanas pra aprovação inicial (Apple é mais rigorosa).
- Versionamento: app reusa o backend de produção — mesma URL, mesmas APIs.
- **Decisão consciente:** começar pelo Android (mais usuários no Brasil + processo mais rápido). iOS num segundo momento.

**Estimativa de tempo realista:** 2–3 semanas pra MVP funcional do app do técnico (7A–7G), +1 semana app do cliente (7H), +1 semana publicação Android (7J). Total: 4–5 semanas até a primeira release real na Play Store.

---

### Fase 8 — Analytics e SLA 📋 PLANEJADA

Dashboards focados em **prestação de contas** — tempo de resposta, taxa de resolução, SLA por prioridade. Hoje os números existem espalhados nos relatórios; a Fase 8 organiza em métricas auditáveis.

#### 8A — Métricas de tempo (base)

- Campos novos em `chamados`: `primeira_resposta_em` (timestamptz, set no primeiro `direcao=saida` após criação) e `tempo_resolucao_seg` (calculado no fechamento)
- View materializada `chamados_metricas` agregando por dia / condomínio / categoria / prioridade
- 4 KPIs base: **TTFR** (time to first response), **TTR** (time to resolution), **taxa de resolução em <1h**, **% reabertos**

#### 8B — SLA configurável

- Migration `012_sla.sql`: `sla_definicoes(prioridade, ttfr_min, ttr_min)` com seeds (emergência: 5min/30min, alta: 15min/2h, média: 1h/8h, baixa: 4h/24h)
- Editável pelo master admin em **Configurações > SLA** (nova aba)
- Cálculo de **SLA estourado** em tempo real: chamado aberto + sem resposta há mais que `ttfr_min` da prioridade → badge vermelho "⚠ SLA"
- Push (Fase 7) e email opcionais quando estoura

#### 8C — Dashboard de SLA (nova seção do menu)

- 4 KPIs no topo: % SLA cumprido (último mês) / TTFR médio / TTR médio / Chamados em risco (próximos a estourar)
- Gráfico **TTR ao longo do tempo** (line chart, 30/60/90 dias)
- Tabela **Performance por técnico** (chamados atendidos / tempo médio / % no SLA / nota média se existir)
- Tabela **Condomínios com mais incidentes** (parecido com o "Top 5" da Insights — refatorar pra reusar)
- Filtros por período + condomínio + categoria + prioridade
- Botão **Exportar PDF** com cabeçalho da empresa (relatório mensal pra cliente)

#### 8D — Histórico longo de leituras (gráficos > 7 dias)

Hoje o `/admin/historico` aceita até `horas=N` com buckets por hora. Pra cobrir SLA mensal, precisa de buckets diários e janelas maiores — depende parcialmente da Fase 9 (agregação).

---

### Fase 9 — Histórico longo + compressão 📋 PLANEJADA

A tabela `leituras` cresce ~1 linha por device por 5 min. Em 100 condomínios com 3 reservatórios cada, são ~86k linhas/dia. Em 6 meses, o Railway começa a doer. A Fase 9 cria política de retenção e agregação **sem mudar o stack** (continua Postgres puro, sem TimescaleDB).

#### 9A — Tabela agregada horária

- Migration `013_leituras_agregadas.sql`: `leituras_agregadas_hora(device_id, hora_truncada, nivel_pct_min, nivel_pct_max, nivel_pct_avg, bomba_pct_ligada, n_amostras)`
- Job em `cron` (ou setTimeout recursivo, padrão do projeto): a cada hora, agrega leituras da **última hora fechada** e insere idempotente (`ON CONFLICT (device_id, hora_truncada) DO UPDATE`)
- Reaproveita o `config.service.js` pra ligar/desligar o job e ajustar intervalo

#### 9B — Tabela agregada diária

- `leituras_agregadas_dia` populada a partir da horária (mais barato que da raw)
- Permite gráficos de 30/90/180 dias sem ler milhões de linhas

#### 9C — Política de retenção

- Configurável em **Configurações > Retenção**:
  - Leituras raw: padrão 60 dias
  - Agregação horária: padrão 1 ano
  - Agregação diária: indefinido
- Job de limpeza diário (3h da manhã, configurável) faz `DELETE` por lotes de 10k linhas pra não travar
- Antes de deletar, gera contagem e loga (audit trail simples em tabela `jobs_log`)
- **Modo "dry-run"** no toggle — mostra quanto seria apagado sem apagar

#### 9D — Adaptar queries existentes

- `GET /admin/historico` ganha lógica:
  - `horas <= 168` (7 dias) → lê de `leituras` (raw)
  - `horas > 168 && horas <= 720` (30 dias) → lê de `leituras_agregadas_hora`
  - `horas > 720` → lê de `leituras_agregadas_dia`
- Chave: o frontend não sabe da diferença — apenas o endpoint serve granularidade adequada

#### 9E — Limpeza retroativa de alertas e conversas antigas

- Alertas resolvidos há > 1 ano → tabela `alertas_arquivados` (mesma estrutura, sem indexes)
- Conversas WhatsApp fechadas há > 1 ano → mensagens vão pra `mensagens_whatsapp_arquivadas`
- Endpoints de listagem só leem a tabela ativa; histórico longo precisa de toggle "incluir arquivados" (raro, viewer não vê)

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
