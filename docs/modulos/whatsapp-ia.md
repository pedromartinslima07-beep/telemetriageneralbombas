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
  1. **Confere a assinatura `X-Hub-Signature-256`**: HMAC-SHA256 do corpo
     **cru** com `WHATSAPP_APP_SECRET` (a Chave secreta do app na Meta). O
     corpo cru é guardado pelo `verify` do `express.json` em `src/app.js`, só
     nessa rota. Sem a variável, sem assinatura ou com assinatura errada →
     **403** e nada é processado (o motivo vai para o log como
     `[whatsapp] webhook recusado: …`). Desde 24/11/2026; teste em
     `scripts/testes/whatsapp-assinatura.test.js`.
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
- Mensagem de **uma palavra só** ("ok", "obrigado") — exceto saudação ("oi",
  "olá") — **e** fora de uma confirmação pendente. ⚠️ Esse filtro roda DEPOIS
  da confirmação: até 24/11/2026 rodava antes, e "Sim" sozinho, a resposta mais
  comum a "Posso abrir o chamado?", era descartado sem resposta.

A IA recebe as **20 últimas** mensagens da conversa, em ordem. Até 24/11/2026
eram as 20 primeiras (`ORDER BY ASC LIMIT 20`): da 21ª em diante ela respondia
sem ver o que o cliente acabara de escrever.

## Contexto pré-injetado

Antes de cada chamada à OpenAI, `_buscarContextoOperacional` injeta no prompt:
telemetria atual (nível/bomba), alertas abertos e chamados em andamento do
condomínio. A IA já entra sabendo o estado real, economizando function calls.

⚠️ **`alertas` não tem `condominio_id`** — é chaveada por `device_id`, e o
condomínio vem pelo `JOIN reservatorios`. Até 24/11/2026 a consulta filtrava
pelo campo inexistente, dava erro, o `catch` engolia e **o contexto nunca
chegava ao prompt**. O erro agora vai para o log (`[ia] contexto operacional
falhou`).

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

## Quando a IA falha (24/11/2026)

- **Tempo-limite**: o cliente da OpenAI tem `timeout: 25000` e uma nova
  tentativa (`maxRetries: 1`). O padrão do SDK esperava até 10 minutos.
- **Teto no laço de ferramentas**: `MAX_VOLTAS_FERRAMENTA` (5). Na última volta
  `tool_choice: "none"` obriga o modelo a responder em texto. Era `while (true)`.
  Argumento de ferramenta que não é JSON volta como erro para o modelo, em vez
  de derrubar a conversa.
- **Falha não vira silêncio**: erro, tempo esgotado ou resposta vazia mandam ao
  cliente "Desculpe, tive um problema para responder agora. Pode repetir…?"
  (`MSG_FALHA_IA` no controller). A falha conta no mesmo `ia_sem_avanco` do
  anti-loop: na 3ª seguida a conversa vai para um atendente. Ideia do bot do
  Petzu.

## Backend é o juiz final (state machine)

```
TRIAGEM → AGUARDANDO_CONFIRMAÇÃO → CHAMADO_ABERTO → FINALIZADO
                                 → TRIAGEM (cliente nega)
TRIAGEM → ESCALADO → FINALIZADO
```

- Ações **não-P1** (`abrir_chamado`, `criar_solicitacao_orcamento`) ficam em
  `pendente_acao (JSONB)` e só executam **após confirmação explícita** do
  cliente (`_executarAcaoPendente`).
- **A resposta do cliente** é lida por `classificarResposta`
  (`src/services/whatsapp-aceite.service.js`): **recusa primeiro** (qualquer
  negação na frase) e **aceite só inequívoco** (a frase inteira é um aceite:
  "sim", "pode abrir", "ok, por favor"). O resto vai para a IA com a ação ainda
  pendente. Até 24/11/2026 eram duas regex de palavra solta com o sim conferido
  antes do não, e "não, pode deixar" ou "não quero" abriam o chamado. Ideia do
  `aceiteInequivoco` do bot do Petzu.
- **Emergência P1** executa direto (sem confirmação).
- **Anti-loop:** `ia_sem_avanco` conta trocas sem progresso; em 3, escala
  automaticamente para humano.
- Guard anti-duplicata: se já há chamado aberto para a `conversa_id`, retorna o
  existente em vez de criar novo.

## Mensagem fora da janela de 24 horas

A Meta só aceita **texto livre** para quem mandou mensagem ao número nas
últimas 24h; para os outros, só **modelo aprovado** (erro 131047). O aviso de
sensor sem comunicação (`offline.job.js` → `_notificarClienteWhatsApp`) olha a
última mensagem **de entrada** do contato:

- dentro das 24h → texto livre, como antes;
- fora → o modelo de **`WHATSAPP_TEMPLATE_SENSOR`** (idioma em
  `WHATSAPP_TEMPLATE_IDIOMA`, padrão `pt_BR`), com `{{1}}` = condomínio e
  `{{2}}` = reservatório. Exemplo de corpo para cadastrar na Meta (categoria
  Utilidade): *"Alerta automático — {{1}}: o sensor do {{2}} parou de enviar
  leituras. Um chamado foi aberto e nossa equipe já foi avisada."*;
- fora e sem modelo configurado → **não manda** e avisa no log. O chamado
  automático e o e-mail de alerta saem do mesmo jeito.

A mensagem só é gravada na conversa **depois** que a Meta aceitou (antes era
gravada antes de enviar, e a central mostrava como enviada a que a Meta
recusou). Por modelo, entra com `tipo = 'template'`. A **conversa nova**
(quando o contato não tem uma aberta) também só é criada depois do envio
aceito: criada antes, cada aviso recusado deixava uma conversa vazia na central
(27/11/2026, quando o modelo entrou no Railway com o número ainda sem
registro). Modelo em produção: `alerta_sensor_sem_comunicacao`, Ativo na Meta
desde 27/11; o envio só liga com `WHATSAPP_PHONE_NUMBER_ID`, que espera o
registro do número. `evolution.service.js`
ganhou `enviarTemplate` e tempo-limite de 15 s em toda requisição; as duas
funções devolvem `{ ok, http }`.

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
