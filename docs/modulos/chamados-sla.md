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

**A fonte é a cláusula 7 da minuta de contrato** (texto vigente desde a minuta
do Guarulhos Office Tower, 02/09/2026), e a regra em código é
`src/services/prioridade.service.js` — **fonte única**. Até 02/09 a mesma
tabela existia em três lugares (`cliente.routes.js`, `app/public/app.js` e a
prosa do prompt da IA) e eles já discordavam entre si.

| Nível | SLA chegada | Enquadramento (texto do contrato) |
|---|---|---|
| **P1 Crítico** | ≤ 3h | risco imediato de desabastecimento relevante; poço/área crítica com risco de inundação; falha crítica de sistema essencial |
| **P2 Alto** | ≤ 48h | falha relevante, **mas** com condição provisória, redundância parcial ou sem risco imediato |
| **P3 Programável** | ≤ 72h | anomalia sem risco imediato; equipamento reserva indisponível **sem perda da função principal**; corretiva não crítica |
| **P4 Baixa criticidade** | agendamento | melhorias, levantamentos, adequações, solicitações estéticas, o que depende de planejamento/orçamento |

### ⚠️ O que classifica é IMPACTO, não tipo de problema

É a coisa mais fácil de errar aqui, e o motivo de a categoria sozinha não
bastar: **o mesmo "vazamento" é P1 alagando a casa de bombas e P3 gotejando
numa gaxeta com a bomba reserva rodando.** Nenhuma tabela categoria→prioridade
resolve isso; quem resolve são duas perguntas:

1. **Há risco imediato?** (desabastecimento relevante, inundação de área
   crítica, falha de sistema essencial) — SIM ⇒ **P1**.
2. **Há redundância?** (a reserva assumiu, existe condição provisória) —
   SIM ⇒ **P3**.

Sem risco e sem redundância ⇒ **P2**. Categoria `manutencao` ⇒ **P4** sempre:
quem marca "manutenção" pede agenda, não socorro.

As respostas ficam em `chamados.triagem_risco_imediato` e
`triagem_redundancia` (migration 082). **NULL = não perguntado**, e não "não":
o painel do síndico, o app e todo chamado anterior a 02/09 não têm triagem.

### ⚠️ É PISO, não trava — e a diferença é contratual

A cláusula **7.1.c** diz que a prioridade *"poderá ser reclassificada
tecnicamente após a triagem ou chegada ao local, **com justificativa**"*.
Travar a escolha violaria o contrato; deixá-la livre era o que existia antes e
não cumpria nada. O desenho é:

- **Subir** acima do piso: livre, sem justificativa.
- **Descer** abaixo do piso: exige `prioridade_motivo` (mínimo 10 caracteres).
  Sem ele o backend responde **400** com `{ piso, criterio, exige }`.
- O piso calculado na abertura fica em `chamados.prioridade_piso` — **gravado,
  não recalculado na leitura**: é o que permite dizer depois "este chamado
  nasceu P1 e alguém baixou". Recalcular usaria a regra de hoje, não a que
  valia na abertura.
- A reclassificação posterior vai pelo `PATCH /chamados/:id`, e o motivo entra
  em `historico_chamados.motivo`. O de/para sozinho ("P1 → P3") registra o quê
  e esconde exatamente o que a cláusula pede.

Na ficha do admin, o botão **reclassificar** (ao lado da pílula de prioridade)
abre o bloco com as quatro faixas e o campo de motivo. Ele fica dentro da
lista de informações, e não num modal, porque reclassificar é decisão tomada
olhando a triagem e a descrição — modal esconderia o que embasa a escolha.

### ⚠️ A IA só pode SUBIR

`abrirChamado` (`ia.service.js`) eleva ao piso quando o modelo classifica
abaixo dele, e loga. Prompt é pedido, não garantia: um modelo que leia "tem
água na garagem mas o zelador fechou o registro" e responda p3 rebaixaria
sozinho um chamado que o contrato põe em P1 — e P1 é o que aciona o plantão
24h da **cláusula 8.1**. A rebaixa exige justificativa humana, e a IA não tem
como assiná-la.

### ⚠️ Recorrência tem teto P2 (mudou em 02/09/2026)

Mesma categoria no mesmo condomínio em 30 dias sobe **um** nível, com teto
**P2**. O mapa antigo era `{ p4:"p3", p3:"p2", p2:"p1" }` — um chamado repetido
virava P1 sozinho, sem justificativa e sem ninguém saber, acionando o plantão
24h. Recorrência não é critério de P1 em lugar nenhum da minuta: lá os
critérios são risco imediato, inundação e falha de sistema essencial. Quando
sobe, a resposta traz `_recorrencia_bump` e o modal avisa antes de fechar.

Demais regras: dúvida entre dois níveis → prevalece o **maior**; redundância só
reduz criticidade se a contingência realmente funciona; SLA mede **chegada do
técnico**, não resolução (7.1.a).

`categoria`: vazamento, bomba_falha, nivel_baixo, sem_agua, ruido, manutencao,
outro. O piso por categoria, para quem não responde triagem, é
`sem_agua`→P1, `vazamento`/`bomba_falha`→P2, `nivel_baixo`/`ruido`/`outro`→P3,
`manutencao`→P4 — os mesmos valores que já valiam, de propósito: o síndico não
pode ver o atendimento dele mudar de faixa porque o escritório ganhou um
formulário.

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

  ⚠️ **`sla_chegada_min` é o número CONTRATUAL — confira contra a cláusula 7
  antes de editar.** P2 ficou em **1440 min (24h)** da migration 028 até
  02/09/2026, enquanto a minuta fecha **48h**: o painel cobrava a equipe um dia
  mais cedo do que o contrato exige, e ninguém tinha por que desconfiar do
  número. A migration 082 corrigiu para 2880. Hoje: P1 180 (3h), P2 2880 (48h),
  P3 4320 (72h), P4 NULL (agendamento) — batendo com
  `SLA_CONTRATUAL_MIN` em `prioridade.service.js`, que existe justamente para
  essa conferência.

  📋 **Pendente, não corrigido:** `ttr_min` de P2 continua em 1440 (24h), agora
  **menor** que o prazo de chegada. TTR é métrica interna (a cláusula 7.1.a diz
  que o SLA é comparecimento, não solução), então não inventei um número — mas
  o par está incoerente e alguém precisa decidir qual é o TTR de P2.
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
