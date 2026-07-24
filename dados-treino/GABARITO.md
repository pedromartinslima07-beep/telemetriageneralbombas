# GABARITO — dados sintéticos de treino

> Gerado por `gerar_dados.py` com `SEED = 42`, período de **90 dias**
> terminando em **2026-07-24**. Rode de novo com a mesma seed para
> reproduzir idêntico; troque a seed no topo do script para variar mantendo os
> mesmos padrões.

## Volumes gerados
- **Chamados:** 120  (~40/mês) — 104 fechados, 9 em atendimento, 7 abertos
- **Alertas:** 44  (34 offline, 8 nível baixo, 2 nível muito baixo)
- **Telemetria:** 721 linhas (8 reservatórios × 90 dias, menos gaps, mais duplicatas de ruído)

## Convenção dos nomes
O repositório não tem seed de condomínios/reservatórios (vivem só no banco de
produção), então os nomes abaixo são **plausíveis, não os reais**. Os `device_id`
seguem a convenção do firmware (`RES_<APELIDO>_<SUP|INF>`).

Condomínios: Residencial Jardim das Acácias, Edifício Monte Belo, Condomínio Parque Ipê, Residencial Vista Verde, Condomínio Bela Vista.

---

## Padrões plantados (o que procurar)

### 1. Técnico com tempo médio de resolução ~3x pior
- **Entidade:** **Carlos Nogueira**
- **Análise:** tabela dinâmica de `chamados` — média de `Tempo resolução (s)` por
  `Técnico` (só `Status = fechado`). Carlos Nogueira destoa (~3x a média geral).
- Média geral de resolução ≈ **7.4 h**; ver tabela abaixo.

### 2. Técnico com 1ª resposta lenta, mas que resolve rápido depois
- **Entidade:** **Diego Ramos**
- **Análise:** criar 2 colunas no Power Query:
  `TTFR = [Primeira resposta em] - [Criado em]` e
  `PósResposta = [Fechado em] - [Primeira resposta em]`.
  Diego Ramos tem **TTFR** muito alto (~horas) mas **PósResposta** o
  menor de todos. Ou seja: o alto tempo total dele vem da demora em *começar*,
  não em *resolver* — o oposto de Carlos Nogueira.

| Técnico | Fechados | Resolução total (h) | TTFR médio (h) | Pós-resposta (h) |
|---|---|---|---|---|
| Anderson Souza | 20 | 5.0 | 0.7 | 4.4 |
| Bruno Carvalho | 15 | 5.7 | 0.8 | 4.9 |
| Carlos Nogueira | 13 | 16.6 | 0.9 | 15.8 |
| Diego Ramos | 16 | 11.0 | 9.2 | 1.0 |
| Eduardo Pinto | 24 | 4.6 | 0.7 | 4.0 |
| Fábio Tavares | 16 | 5.0 | 1.0 | 3.8 |

### 3. Condomínio que concentra alertas de offline (rede local)
- **Entidade:** **Condomínio Parque Ipê** (devices RES_IPE_SUP / RES_IPE_INF)
- **Análise:** tabela dinâmica de `alertas` — contagem de `Tipo = dispositivo_offline`
  por `Condomínio`. Condomínio Parque Ipê tem **30 de 34**
  alertas offline. Cruze com `telemetria`: nesses dias o device tem `Leituras`
  bem abaixo de 96.

### 4. Reservatório com queda lenta e constante (vazamento)
- **Entidade:** **RES_MONTE_INF** — Edifício Monte Belo, Cisterna (inferior)
- **Análise:** em `telemetria`, gráfico de linha de `Nível médio (%)` por `Dia`
  filtrando esse device. Cai de ~**68%** (início) para ~**15%**
  (fim) de forma monotônica — nenhum outro reservatório tem tendência.

### 5. Reservatório com bomba ligada em ~95% das leituras
- **Entidade:** **RES_VVERDE_SUP** — Residencial Vista Verde
- **Análise:** em `telemetria`, coluna calculada
  `% bomba = [Leituras c/ bomba ligada] / [Leituras]`, média por `Device ID`.
  RES_VVERDE_SUP fica em ~**95%** (os demais ~22–40%).

### 6. Device com volume de leituras bem abaixo do esperado (sem alerta formal)
- **Entidade:** **RES_BVISTA_SUP** — Condomínio Bela Vista
- **Análise:** em `telemetria`, ordenar/filtrar `Leituras` << 96 em vários
  dias (~20–45). O truque: **não há alerta correspondente** em `alertas` para esse
  device — some só olhando o volume de leituras, não o painel de alertas.

### 7. Condomínio com categoria recorrente (sempre vazamento)
- **Entidade:** **Edifício Monte Belo**
- **Análise:** tabela dinâmica de `chamados` — `Categoria` × `Condomínio`.
  Edifício Monte Belo tem **22 de 35** chamados como
  `vazamento` (concentração muito acima do normal).

### 8. Correlação entre arquivos (o vazamento amarra tudo)
- **Entidade:** **RES_MONTE_INF** / **Edifício Monte Belo**
- **Análise:** o mesmo reservatório que cai de nível (padrão 4, `telemetria`)
  dispara alertas `nivel_baixo`/`nivel_muito_baixo` (`alertas`) **e** gera chamados
  `vazamento` no Edifício Monte Belo (`chamados`, padrão 7) — todos no
  mesmo período, com concentração crescente no fim. Junte os 3 arquivos por
  condomínio/reservatório e período para enxergar a história completa.

---

## Coluna extra: `SLA estourado` (em chamados.csv)

Coluna **derivada**, adicionada a pedido — **não existe no export real** hoje.
Ela materializa no CSV a regra `_chamadoSlaEstourado(ch)` que o `admin.js` calcula
em tela (o sistema trata isso como *alerta crítico* na página de Alertas, mas **não**
grava na tabela `alertas` — por isso a marca vive no chamado, não em alertas.csv).

- **Prazos usados** (tabela real `sla_definicoes`, em minutos): p1 = 15/240,
  p2 = 60/1440, p3 = 240/4320, p4 = 1440/14400  (TTFR = 1ª resposta / TTR = resolução).
- **Regra:** só chamado **não fechado** pode estourar. `Sim` quando, ainda aberto,
  passou do **TTFR** sem `Primeira resposta em`, **ou** passou do **TTR** de resolução.
- **Neste dataset:** 13 chamados com `SLA estourado = Sim`
  (por prioridade: {'p2': 5, 'p3': 7, 'p1': 1}).
- **Duas origens do estouro:** (a) chamado `aberto` **sem** `Primeira resposta em` que
  passou do **TTFR**; (b) chamado não fechado (aberto/em_atendimento) que passou do
  **TTR** de resolução. Só chamados vivos entram — um fechado que demorou não conta.
- **Análise sugerida:** tabela dinâmica `SLA estourado` × `Prioridade` / `Condomínio` /
  `Técnico`. Repare que há **7** chamados **P3/P4** estourados — na regra
  antiga eles seriam "normais" (severidade só pela prioridade); a regra nova os eleva
  a crítico. É aí que o `SLA (h)` mostra sua limitação (discutida na análise): ele é
  tempo decorrido, não diz se estourou — quem responde isso é esta coluna.

---

## Ruído embutido (para não ficar "limpo demais")
- ~5% dos chamados sem `Primeira resposta em`.
- Chamados ainda abertos (`aberto`/`em_atendimento`) sem `Fechado em` nem `Tempo resolução (s)`.
- 3 linhas de `telemetria` duplicadas (idênticas).
- **RES_IPE_INF** (Condomínio Parque Ipê) fica **2 dias seguidos sem nenhuma leitura** (2026-06-11 e 2026-06-12).
- Volume de chamados menor em fins de semana + 3 dias de pico.
- Alguns chamados abertos sem técnico atribuído (`Técnico` vazio).

## Formato do arquivo (igual ao export real)
- Separador `;`, quebra de linha CRLF, UTF-8 **com BOM**.
- Datas em **ISO-8601 UTC** (`...Z`); `Dia` da telemetria à meia-noite UTC.
- Decimais (`SLA (h)`, `Tempo (h)`) usam **ponto** (`4.5`) — no Power Query, importe
  essas colunas com *locale* en-US (ou troque `.` por `,`) para não virar texto.
