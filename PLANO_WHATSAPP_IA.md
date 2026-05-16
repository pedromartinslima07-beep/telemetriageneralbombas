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

**Pendente da 3A (melhorias futuras):**
- [ ] Gauge ApexCharts radial substituindo a barra de nível simples
- [ ] Polling independente por tipo de dado (telemetria mais rápida que chamados)
- [ ] Badge pulsante / notificação sonora para chamados novos em tempo real

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

#### 3B — Mapa interativo de condomínios

**Biblioteca:** Leaflet.js (open source, sem API key, ~40kb)

**O que o mapa mostrará:**
- Pin por condomínio na posição geográfica real
- Cor do pin reflete status: verde (ok) → amarelo (alerta) → vermelho (offline/emergência)
- Cluster automático quando há muitos pins próximos

**Ao clicar no pin — popup com:**
- Nome do condomínio
- Nível atual do reservatório
- Status da bomba
- Chamados abertos
- Botão "Ver detalhes" → abre o drawer com abas completo

**Nova seção na sidebar:** "Mapa" — carrega a pedido (não no polling geral)

Itens:
- [ ] Migration: `ALTER TABLE condominios ADD COLUMN lat NUMERIC(9,6), ADD COLUMN lng NUMERIC(9,6)`
- [ ] Adicionar Leaflet.js ao projeto (arquivo local, sem CDN externo)
- [ ] Seção "Mapa" na sidebar e HTML
- [ ] Renderização dos pins com cor dinâmica por status
- [ ] Popup com telemetria ao clicar no pin
- [ ] Campo de coordenadas no cadastro/edição de condomínio (admin)

### Fase 4 — Integração telemetria automática
- [ ] Ao abrir chamado, anexa última leitura do condomínio automaticamente
- [ ] Alerta de telemetria crítico → IA abre chamado + notifica cliente via WhatsApp automaticamente

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
