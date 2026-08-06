---
tags:
  - projeto
  - fluxo
aliases:
  - Chamados
  - SLA
  - P1-P4
---
# Fluxo: Chamados, Criticidade P1–P4 e SLA

## Abertura de chamado

Origens possíveis:
- **IA** (via WhatsApp, após confirmação ou direto se P1).
- **Cliente** (`POST /cliente/chamados`, app/painel).
- **Admin** (`POST /chamados`, masterAdmin).
- **Plano de manutenção** (job gera chamado P4 ao vencer).
- **Automático via `abrirChamadoAuto`** (`src/services/chamados.service.js`):
  dispositivo offline (`offline.job.js`, categoria `bomba_falha`, P2) e nível
  de reservatório baixo/muito baixo (`POST /telemetria`, categoria
  `nivel_baixo`, P3/P2). Faz dedup por `condominio_id + categoria` — se já
  existe chamado aberto na mesma dupla, reaproveita e só escalona a
  prioridade (nunca abre um 2º).

Ao abrir, anexa automaticamente a última leitura de telemetria do condomínio
(integração Fase 4). Campos-chave: `condominio_id`, `categoria`, `prioridade`,
`titulo`, `descricao`, `conversa_id`/`plano_manutencao_id` quando aplicável.

## Classificação de criticidade (P1–P4)

**Fórmula:** Risco Técnico + Impacto Operacional + Recorrência + Estratégia do
Cliente + Urgência Real. Triagem (pare no primeiro SIM):

| Nível | SLA chegada | Gatilho |
|---|---|---|
| **P1 Crítico** | ≤ 3h | sem água, alagamento, esgoto, queimado, risco de incêndio |
| **P2 Alta** | 24–48h | modo parcial, contingência, redundância comprometida |
| **P3 Controlado** | ≤ 72h | funciona, precisa de inspeção / pequena correção |
| **P4 Agendado** | conforme agenda | preventiva, projeto, retrofit, instalação planejada |

Regras especiais:
- Dúvida entre dois níveis → prevalece o **maior**.
- **Recorrência** (mesma falha no mês) sobe 1 nível automaticamente.
- Redundância só reduz criticidade se a contingência realmente funciona.
- SLA mede **chegada do técnico**, não resolução.

`categoria`: vazamento, bomba_falha, nivel_baixo, sem_agua, ruido, manutencao,
outro.

## Ciclo de vida

```
aberto → técnico atribuído → em_atendimento (GPS chegada)
       → O.S. digital preenchida → fechado
```

- **`em_atendimento` só é setado via app do técnico** em
  `POST /chamados/:id/iniciar-atendimento` (com GPS). `PATCH /chamados/:id`
  bloqueia esse status — garante presença física no campo.
- `POST /chamados/:id/a-caminho` e `/chegou` registram
  `tecnico_a_caminho_em` / `tecnico_chegou_em` (SLA de chegada).
- Toda mudança é gravada em `historico_chamados` (auditoria, reaberturas).
- Técnico vê os seus em `GET /chamados/meus`; chat do chamado em
  `/chamados/meus/:id/mensagens`.

## SLA e métricas

- `sla_definicoes` por prioridade: `ttfr_min` (1ª resposta), `ttr_min`
  (resolução), `sla_chegada_min` (chegada). Editável em `/admin/sla`.
- `chamados.primeira_resposta_em`, `tempo_resolucao_seg` alimentam as métricas.
- **O que marca `primeira_resposta_em` (TTFR).** Todos os hooks gravam
  `COALESCE(primeira_resposta_em, NOW())` — a primeira escrita ganha e nada
  depois sobrescreve:
  - `PATCH /chamados/:id` — transição de status saindo de `aberto`,
    **atribuição de técnico** (`tecnico_id`) ou **de responsável**
    (`responsavel_id`). Desatribuir (mandar `null`) **não** conta.
  - Técnico manda mensagem no chat do chamado.
  - Admin comenta no chamado (`POST /alertas/chamado/:id/comentarios`).
  - `POST /chamados/:id/iniciar-atendimento` e `/chegou`.
  - Finalização da O.S. (backfill defensivo — a essa altura já deveria estar
    preenchido).

  Não contam: mensagem do cliente, resposta da IA no WhatsApp e apenas abrir/ler
  o chamado no painel.
- **Painel ao vivo:** `GET /relatorios/painel-vivo` — chamados em risco
  (≥ 50% do TTR usado) + workload por técnico, estado atual sem filtro de
  período. Substituiu o antigo dashboard de gráficos por período — análise
  histórica de SLA (por técnico, prioridade, TTFR/TTR) agora é feita fora do
  app, a partir do CSV de `GET /relatorios/chamados` (que carrega
  `primeira_resposta_em` e `tempo_resolucao_seg` crus pra isso).
- **SLA estourado vira alerta:** um chamado que estoura o SLA (TTFR sem primeira
  resposta / TTR além do prazo — flags `sla_ttfr_estourado`/`sla_ttr_risco`) é
  elevado a **alerta crítico** na página de Alertas (agregação frontend),
  badge do menu e KPI do Dashboard. Não há e-mail automático de atraso (o antigo
  `chamados-atraso.job.js` foi removido); a coluna `alerta_atraso_enviado_em`
  permanece no schema mas não é mais usada.

## Avaliação

Cliente avalia o atendimento (`POST /cliente/chamados/:id/avaliar`, nota 1–5 +
comentário) → `avaliacao_nota/comentario/em`.

## Tabelas

`chamados`, `historico_chamados`, `sla_definicoes`, `tecnicos`,
`tecnico_localizacoes` (GPS p/ ETA), e o vínculo com `ordens_servico`.
