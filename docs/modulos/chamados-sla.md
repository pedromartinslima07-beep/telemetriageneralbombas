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
- **Admin** (`POST /chamados`, adminOnly — admin, gerente e operador).
  Sem `prioridade` no corpo, quem decide é a categoria (ver abaixo); o modal
  do painel manda sempre a explícita.
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

⚠️ **A RÉGUA É A CLÁUSULA 7 DA MINUTA** ("DOS CHAMADOS E SLA P1-P4"), conferida
contra o contrato em 03/09/2026. Ela vive em `src/services/prioridade.service.js`
e chega à tela por `GET /chamados/prioridades`.

| Nível | SLA chegada | Enquadramento (texto da cláusula 7) |
|---|---|---|
| **P1 Crítico** | até 3h | risco imediato de desabastecimento relevante; poço ou área crítica com risco de inundação; falha crítica de sistema essencial |
| **P2 Alto** | até 48h | falha relevante, mas com condição provisória, redundância parcial ou sem risco imediato à segurança e ao abastecimento geral |
| **P3 Programável** | até 72h | anomalia sem risco imediato; equipamento reserva indisponível sem perda da função principal; ajuste ou corretiva não crítica |
| **P4 Baixa criticidade** | agendamento | melhorias, levantamentos, adequações, solicitações estéticas ou serviços que dependam de planejamento e orçamento |

⚠️ **O PRAZO VEM DE `sla_definicoes`, NUNCA DO HTML.** Os quatro botões do modal
de novo chamado traziam "≤ 3h", "24-48h" e "≤ 72h" escritos à mão — e o
"24-48h" prometia uma janela que a cláusula não dá (ela diz **até** 48 horas).
Pior: editar o SLA em Configurações não mudava o que a tela dizia. Os valores em
produção conferem com a minuta desde a migration 028; o que faltava era a tela
lê-los.

⚠️ **Os rótulos são os do contrato.** A tela dizia "Alta", "Controlado" e
"Agendado"; a minuta diz "Alto", "Programável" e "Baixa criticidade / melhoria".
Painel e contrato falando nomes diferentes da mesma coisa é como uma conversa
com o síndico vira discussão.

### A categoria sugere a prioridade (03/09/2026)

Pedido do Pedro: *"na abertura de chamados, em vez de ficar 100% pro usuário
escolher, ele ir trocando sozinho dependendo do serviço?"*.

⚠️ **SUGERE, NÃO TRAVA — e é a própria minuta que autoriza.** Cláusula 7.1.c:
*"A prioridade poderá ser reclassificada tecnicamente após a triagem ou chegada
ao local, com justificativa"*. No painel do admin a categoria move o seletor e
escreve por quê, com o texto da cláusula; **assim que a pessoa escolhe à mão, a
sugestão para de mexer** — quem atende o telefone sabe coisas que a categoria não
carrega (se há redundância, se o poço está alagando).

No painel do **cliente** ela decide sozinha, e isso é anterior a tudo isto:
cliente marca tudo como emergência, e isso inviabiliza a fila do técnico.

| Categoria | Prioridade | Por quê |
|---|---|---|
| `sem_agua` | P1 | "risco imediato de desabastecimento relevante" |
| `vazamento` | P2 | falha relevante com condição provisória; **sobe a P1 na triagem** em poço/área crítica com risco de inundação |
| `bomba_falha` | P2 | idem; P1 quando não houver redundância |
| `nivel_baixo` | P3 | ainda não é desabastecimento — é o aviso antes dele |
| `ruido` | P3 | "anomalia sem risco imediato" |
| `manutencao` | **P4** | decisão expressa do Pedro (03/09/2026) — ver [`../../memory-bank/decisions.md`](../../memory-bank/decisions.md) |
| `melhoria` | P4 | o texto do P4 na cláusula 7 (migration 081) |
| `outro` | P3 | sem informação para triar, o meio da tabela |

⚠️ **`melhoria` NASCEU PARA O P4 SER ALCANÇÁVEL.** Sem ela, "levantamento",
"adequação" e "melhoria estética" caíam em `outro` e viravam P3 — 72 horas de
comparecimento para um pedido que a minuta manda **agendar**.

⚠️ **Categoria desconhecida cai em P3, nunca em P1.** Errar para cima enche o
plantão de coisa que não é plantão, e a cláusula 8.1 reserva a cobertura 24
horas ao P1.

### A recorrência deixou de ser muda (03/09/2026)

Chamado da mesma categoria, no mesmo prédio, nos últimos 30 dias sobe um nível
(teto em P1; P4 no histórico não conta). A regra é antiga; o que mudou é que
**ela fazia isso calada**: o operador escolhia P2, o banco gravava P1, e quem
visse a fila depois concluía que alguém errou a classificação. Hoje a resposta
de `POST /chamados` traz `prioridade_ajustada` (`{de, para, motivo, texto}`) e o
modal segura aberto para contar antes de fechar.

Regras especiais:
- Dúvida entre dois níveis → prevalece o **maior**.
- Redundância só reduz criticidade se a contingência realmente funciona.
- SLA mede **chegada do técnico**, não resolução (cláusula 7.1.a: é prazo de
  mobilização e comparecimento, **não** garantia de solução no mesmo prazo).
- O prazo **suspende** por impedimento de acesso, portaria sem liberação, risco
  à segurança, terceiros, caso fortuito (cláusula 7.1.d) — hoje o sistema não
  modela essa suspensão; o relógio corre.

⚠️ **O `sla_definicoes` é GLOBAL, não por contrato.** Os prazos valem para os 86
prédios. Se as minutas antigas divergirem da nova, o sistema promete a régua do
Saint Antoine para todos. Pendência aberta.

`categoria`: vazamento, bomba_falha, nivel_baixo, sem_agua, ruido, manutencao,
melhoria, outro — **a lista tem uma cópia só**, em
`src/services/prioridade.service.js`. Ela vivia repetida em `chamados.routes.js`,
`cliente.routes.js`, `operador.routes.js` e no `enum` da função da IA: quatro
lugares para acrescentar uma categoria, e o quinto calado quando alguém
esquecesse — com a IA classificando com um valor que o `INSERT` recusa.

## Ciclo de vida

```
aberto → técnico atribuído → em_atendimento (GPS chegada)
       → O.S. digital preenchida → fechado

aberto | em_atendimento → cancelado          (com motivo, pela gestão)
fechado | cancelado     → aberto             (reabertura)
```

### O cancelamento (04/09/2026, migration 083)

⚠️ **FECHAR AFIRMA QUE O SERVIÇO FOI FEITO.** Até esta data o chamado tinha
três status, e a única saída para o aberto por engano, duplicado ou desistido
pelo cliente era **fechar** — o que enfiava cada engano em `tempo_resolucao_seg`,
na taxa de resolução e no tempo médio do painel como atendimento cumprido.
`cancelado` tira o chamado da fila **sem escrever nenhuma das três**.

| | `fechado` | `cancelado` |
|---|---|---|
| significa | serviço prestado | serviço desistido |
| `fechado_em` | grava | **não** |
| `tempo_resolucao_seg` | grava | **não** |
| `primeira_resposta_em` (TTFR) | marca | **não** — cancelar não é responder |
| taxa "% resolvido" | entra | **fora do denominador** |
| quem pode | admin, gerente, **operador** | admin, gerente (`GESTAO_ROLES`) |
| exige motivo | não | **sim**, mín. 5 caracteres |

- **Onde se cancela:** só a ficha do chamado no [painel do
  admin](painel-admin.md), por modal — nunca um clique só, porque o backend
  recusa sem motivo e um atalho aqui só saberia mostrar erro.
- **Chamado fechado não se cancela** (409). Fechado tem O.S., talvez avaliação
  do cliente e tempo de resolução gravado; cancelar apagaria da métrica um
  atendimento que aconteceu. Se foi fechado por engano: reabrir, depois
  cancelar — duas decisões, duas linhas no `historico_chamados`.
- **Reabrir um cancelado** é `status: "aberto"` normal. `cancelado_em` e
  `cancelado_motivo` ficam como memória do último cancelamento, pela mesma
  regra do `fechado_em`.
- **O motivo vai para o cliente**, no painel e no app: quem abriu o pedido é
  quem mais precisa saber por que ele saiu da fila.
- ⚠️ **"Em aberto" passou a ser o contrário de DUAS coisas.** Todo
  `status != 'fechado'` do sistema contava o cancelado como fila viva — a fila
  do técnico, o dedup de `abrirChamadoAuto`, o contador por condomínio, o
  workload por técnico, o guard anti-duplicata da IA. Hoje o backend escreve
  `NOT IN ('fechado','cancelado')` e cada front tem **um** helper:
  `_chEmAberto` em `public/admin.js` e `chEmAberto` em `app/public/app.js`
  (um só para as duas telas do app, a do técnico e a do cliente).
- ⚠️ **O orçamento volta a pedir execução.** `execucao()` em
  `public/operador-orcamentos.js` lia qualquer chamado não-aberto como "feito":
  o orçamento sumia da fila do operador como executado **porque** o serviço
  deixou de ser feito. Cancelado devolve `livre`. Mesmo defeito e mesma correção
  no `_avExecBadge` do admin — as duas telas escolhem pelo mesmo critério.
- **Teste:** `scripts/testes/cancelar-chamado.test.js` (23 checagens, rota de
  verdade contra o banco de teste).

- **`em_atendimento` só é setado via app do técnico** em
  `POST /chamados/:id/iniciar-atendimento` (com GPS). `PATCH /chamados/:id`
  bloqueia esse status — garante presença física no campo. Os que ele aceita
  são `aberto`, `fechado` e `cancelado`.
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
