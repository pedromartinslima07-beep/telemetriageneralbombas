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
- **Dashboard SLA:** `GET /relatorios/sla-metricas` e `/sla-dashboard` (por
  técnico / prioridade / período).
- **Alerta de atraso:** `chamados-atraso.job.js` envia email quando um chamado
  em atendimento estoura o prazo (`chamados.alerta_atraso_horas/_enabled`),
  registrando `alerta_atraso_enviado_em` para não duplicar.

## Avaliação

Cliente avalia o atendimento (`POST /cliente/chamados/:id/avaliar`, nota 1–5 +
comentário) → `avaliacao_nota/comentario/em`.

## Tabelas

`chamados`, `historico_chamados`, `sla_definicoes`, `tecnicos`,
`tecnico_localizacoes` (GPS p/ ETA), e o vínculo com `ordens_servico`.
