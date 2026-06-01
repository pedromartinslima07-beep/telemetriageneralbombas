---
tags:
  - projeto
  - fluxo
aliases:
  - WhatsApp
  - IA
  - Atendimento
---
# Fluxo: Atendimento WhatsApp + IA

Assistente de atendimento que conversa em linguagem natural, consulta dados
reais e **sugere ações que o backend executa**. A IA nunca executa diretamente.

## Entrada

```
Cliente WhatsApp → Meta WhatsApp Business API → POST /whatsapp/webhook
```

- **Verificação** (`GET /whatsapp/webhook`): responde o `hub.challenge` da Meta
  conferindo `WHATSAPP_VERIFY_TOKEN`.
- **Recebimento** (`POST /whatsapp/webhook`, `whatsapp.controller.js`):
  1. Valida o verify token.
  2. **Responde 200 imediatamente** e processa em background (`setImmediate`) —
     a Meta reenvia se demorar.
  3. Salva a mensagem em `mensagens_whatsapp` com `ON CONFLICT DO NOTHING` por
     `evolution_message_id` (**idempotência**). Tipos não-texto (imagem/áudio/
     doc/localização) são salvos sem quebrar; só texto é processado pela IA.

## Pré-validações (antes da IA)

A IA **não responde** se:
- Conversa **assumida por humano** (`assumida_por_id` setado).
- `aguardando_atendente = true` (escalonada).
- `aguardando_avaliacao = true` → captura a nota 1–4 e encerra.
- Sessão expirada (> `whatsapp.sessao_timeout_horas`, default 8h) → abre nova
  conversa, IA recomeça do zero.

## Contexto pré-injetado

Antes de cada chamada à OpenAI, `_buscarContextoOperacional` injeta no prompt:
telemetria atual (nível/bomba), alertas abertos e chamados em andamento do
condomínio. A IA já entra sabendo o estado real, economizando function calls.

## Função da IA (`ia.service.js`)

OpenAI `gpt-4o-mini` com **function calling**. Tools disponíveis (entre outras):
- `buscar_telemetria(condominio_id)`
- `abrir_chamado({ titulo, descricao, prioridade(p1-p4), categoria })`
- `buscar_chamados_abertos(condominio_id)`
- `buscar_status_tecnico({ chamado_id })` — GPS do técnico → distância Haversine
  → ETA (40 km/h urbano)
- `escalar_para_atendente` — IA para de responder, conversa vai p/ humano
- `criar_solicitacao_orcamento` — registra pedido + email comercial

Modelo e `system_prompt` editáveis via config dinâmica (`ia.modelo`,
`ia.system_prompt`, `ia.enabled`).

## Backend é o juiz final (state machine)

```
TRIAGEM → AGUARDANDO_CONFIRMAÇÃO → CHAMADO_ABERTO → FINALIZADO
                                 → TRIAGEM (cliente nega)
TRIAGEM → ESCALADO → FINALIZADO
```

- Ações **não-P1** (`abrir_chamado`, `criar_solicitacao_orcamento`) ficam em
  `pendente_acao (JSONB)` e só executam **após confirmação explícita** do
  cliente (`_executarAcaoPendente`).
- **Emergência P1** executa direto (sem confirmação).
- **Anti-loop:** `ia_sem_avanco` conta trocas sem progresso; em 3, escala
  automaticamente para humano.
- Guard anti-duplicata: se já há chamado aberto para a `conversa_id`, retorna o
  existente em vez de criar novo.

## Saída e central de atendimento (admin)

- IA responde via **Meta API** (`evolution.service.js` →
  `graph.facebook.com/.../{phone_id}/messages`).
- Central CRM (`/whatsapp`, 3 colunas): lista / chat / info.
  - **Assumir** (`PATCH /conversas/:id/assumir`) → IA cala; **devolver-ia** volta.
  - **Responder** manual (`POST /conversas/:id/responder`) — auto-assume.
  - **IA assistiva:** `POST /conversas/:id/resumir` e `/sugerir-resposta`.
  - **Vincular condomínio**, **fechar/reabrir**, **apagar** (CASCADE em
    mensagens, SET NULL em chamados).

## Ciclo de sessão e curadoria

- IA resolve → cliente some → após o timeout, `conversas-timeout.job.js` fecha a
  conversa e pede avaliação pelo próprio WhatsApp (1-Ótimo … 4-Ruim).
- Admin pode classificar `qualidade_atendimento` (excelente/boa/aceitavel/ruim).
- `GET /whatsapp/conversas/export` (masterAdmin) gera **NDJSON** com **PII
  scrubbing** (CPF, CNPJ, telefone, email, CEP, RG → tokens) — dataset pronto
  para fine-tuning futuro (Fase 10).

## Tabelas envolvidas

`clientes_whatsapp` (telefone→condomínio/usuário, tipo B2B/PF),
`conversas_whatsapp` (estado, assumida, aguardando, qualidade, canal),
`mensagens_whatsapp` (direção, ia_categoria, ia_urgencia p1-p4, lida_em),
`chamados`.

## Status atual

Código migrado de Evolution API para **Meta Business API** — pronto, **pendente
configuração** das credenciais Meta. Ver [`../../memory-bank/active-work.md`](../../memory-bank/active-work.md).
