---
tags:
  - projeto
  - contexto/em-andamento
aliases:
  - Trabalho em Andamento
---
# Trabalho em Andamento

> Branch atual: `feature/app-mobile`. Última sessão registrada: **2026-06-02**.
> Roadmap completo em [`roadmap.md`](roadmap.md); decisões em [`decisions.md`](decisions.md).

## Foco atual — Preparação para deploy

O grosso das funcionalidades está concluído. O trabalho ativo é colocar o
sistema em produção real com WhatsApp ligado.

- **Banco de produção (Railway) limpo** de dados de teste — sobrevivem apenas
  logins e configurações. Scripts: `migrations/limpar-dados-teste.sql` (DELETE
  explícito, sem TRUNCATE CASCADE) + `migrations/restaurar-defaults.sql`.
- Branch `feature/app-mobile` precisa ser **mergeada/deployada na main** para o
  Railway.

## Funcionalidades em desenvolvimento / pendentes

### Gateway WhatsApp — Meta Business API · CÓDIGO PRONTO, PENDENTE CONFIGURAÇÃO
Código migrado de Evolution API → **Meta WhatsApp Business API** (número
verificado, zero risco de ban). Falta só a configuração externa:
1. Criar app no developers.facebook.com (tipo Business) + produto WhatsApp.
2. Cadastrar número e obter `WHATSAPP_PHONE_NUMBER_ID`.
3. Gerar token permanente `WHATSAPP_ACCESS_TOKEN` (Usuário do Sistema).
4. Configurar webhook na Meta: `https://SEU_DOMINIO/whatsapp/webhook`,
   verify token `general-bombas-verify-2026`.
5. Testar fluxo completo com número real.

Envs necessárias: `OPENAI_API_KEY`, `WHATSAPP_VERIFY_TOKEN`,
`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`.

### Fase 10 — Treinar IA com histórico · 🟡 EM ANDAMENTO
- **10A — Curadoria** ✅ concluída (Migration 038): qualidade do atendimento +
  export NDJSON com PII scrubbing.
- **Bloqueio de volume:** few-shot/fine-tuning só fazem sentido com ~500+
  conversas curadas. Hoje há ~1 conversa (WhatsApp real ainda não conectado).
  A infra está pronta; o dataset cresce com o uso.
- **10B (few-shot por categoria)**, 10C (A/B), 10D (fine-tuning), 10E
  (guardrails) — aguardando massa crítica de conversas.

### Itens adiados conscientemente
- **7G — Push notifications nativas** ⏸️ depende da 7J (publicação nas lojas).
- **7J — Publicação Play Store** — pendente.
- **WebSocket no WhatsApp** — adiado; polling de 5s suficiente para o volume.

## Próximos passos (da última sessão, 2026-05-28)

1. Cadastrar demais usuários (técnicos, admin_viewer) via Configurações →
   Usuários.
2. Cadastrar condomínios e reservatórios reais.
3. Configurar Meta for Developers (credenciais WhatsApp).
4. Subir branch `feature/app-mobile` para Railway.
5. Testar fluxo completo com número WhatsApp real.
6. 10B — few-shot por categoria (aguardar volume de conversas curadas).
7. 7J — publicação Play Store.

## Melhorias recentes (sessão 2026-06-02)

- **Cadastro de clientes — Nome Fantasia + CNPJ persistido.**
  - Migration 044: `condominios.nome_fantasia TEXT` (nome principal de exibição).
  - `nome` passa a ser tratado como razão social (obrigatório); `nome_fantasia`
    é opcional e tem prioridade na UI (tabela, detalhe lateral, modal).
  - CNPJ agora é **gravado no banco** (antes era só lookup): incluído nos
    endpoints POST/GET/PATCH e no payload dos dois modais (novo e editar).
  - Modal "Novo cliente" redesenhado em **dois painéis horizontais** (campos
    em grid 2 col + mini-mapa ao lado); largura 1 100 px.
  - Painel lateral: CNPJ formatado, razão social como subtítulo quando há
    nome fantasia; busca por texto inclui `nome_fantasia`.

## Melhorias recentes (sessão 2026-06-01)

- **App mobile — camada visual HUD "Painel de comando"** (`app/public/app.css`,
  só mobile, não toca admin/site). Bloco aditivo no fim do CSS + tokens
  `--hud-*` no `:root`: grid técnico + scanline de fundo (estáticos), números/IDs
  em monospace, headers uppercase tracked com tique âmbar + glow no head-icon,
  hairline âmbar nos headers, indicador de aba ativa no bottom-nav, linha de
  dados animada no login e anel de varredura no splash. Reversível.
- **Corner-brackets âmbar descartados** após review visual (poluíam — pareciam
  "cantos de quadradinho amarelo" repetidos em todo card). Ver
  [`decisions.md`](decisions.md).
- **Pegadinha corrigida:** redefinir `position: relative` em `.cli-nav` /
  `.app-header*` quebra o `position: sticky` original (mesma especificidade,
  regra do HUD vinha depois) → menu/header "desciam" com o scroll. Pseudos de
  HUD funcionam direto sobre o `sticky`, sem precisar de `relative`.
- **Legibilidade dos KPIs:** labels dos `.rc` ficam na fonte normal; só os
  valores numéricos em monospace.

## Melhorias recentes (sessão 2026-05-28)

- Role `master_admin` **removido** (nunca foi atribuído; hierarquia real é
  admin / admin_viewer / tecnico / cliente).
- App cliente: botão Suporte no nav da Conta + KPIs clicáveis de chamados.
- Chamados: "Em atendimento" só via app do técnico com GPS (`/iniciar-atendimento`);
  `PATCH /chamados/:id` bloqueado para esse status.
- IA: function `buscar_status_tecnico` (ETA via GPS+Haversine), escalada por
  frustração/compromisso comercial, anti-duplicata de chamado.
- Admin: lógica de badges de notificação corrigida.
- PDF de orçamento: **Puppeteer singleton** (sem cold start de 10-20s no Railway)
  + `waitUntil: domcontentloaded`.
- Auth: `OTP_DISABLED` lido com `.trim()`; `redirectByRole` inclui
  `tecnico → /tecnico/painel`.
