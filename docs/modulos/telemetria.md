---
tags:
  - projeto
  - fluxo
aliases:
  - Telemetria
  - Leituras
  - ESP32
---
# Fluxo: Telemetria

Do dispositivo físico ao alerta no painel.

## Origem dos dados

ESP32 (`firmware/esp32_telemetria.ino`) lê:
- **Sonda 4-20mA** no ADC 34 → `adc_raw` (nível do reservatório).
- **Sensor de corrente SCT-013** no pino 35 → `bomba_rms` (RMS, indica se a
  bomba está girando).

Envia JSON via HTTPS a cada ~10s com `device_id`, `adc_raw`, `bomba_rms`.
**Nenhuma calibração ou threshold vive no firmware** — tudo é configurado
remotamente pelo painel.

## Ingestão — `POST /telemetria` (`telemetriaLimiter`)

1. **Validação** de `device_id`, `adc_raw`, `bomba_rms`.
2. **Auth do dispositivo** via header `X-Device-Key`, comparada à
   `reservatorios.device_key` (chave por reservatório, não global).
3. **Query única** com `LEFT JOIN LATERAL` traz reservatório + última leitura
   em um round-trip.
4. **Conversão ADC → percentual** usando a calibração do reservatório
   (`adc_zero`, `adc_por_metro`, `altura_total_m`, `faixa_sonda_m`).
5. **Decisão da bomba**: `bomba_rms ≥ limiar_bomba` → ligada.
6. **Write threshold** — só persiste a leitura se `Δ nivel_pct ≥
   TELEMETRIA_PCT_THRESHOLD` **ou** passou `TELEMETRIA_HEARTBEAT_MIN` minutos
   desde a última gravação. (ESP32 envia muito; banco grava o que importa.)
7. **CTE única** combina, em uma transação:
   - `INSERT` em `leituras`,
   - `UPDATE reservatorios.last_seen`,
   - auto-resolve de alerta `dispositivo_offline` aberto.
8. **Geração/resolução de alertas de nível**, via `alertas.service.js`. Roda em
   **toda** request, inclusive nas que o threshold não gravou — o alerta é
   estado atual, não histórico.

## Alertas

- Tabela `alertas`, chaveada por `device_id` + `tipo`, com índice **parcial
  único** `uniq_alerta_aberto WHERE status='aberto'` → garante no máximo 1
  alerta aberto por device+tipo (upsert idempotente). O índice **não** impede
  `nivel_baixo` e `nivel_muito_baixo` abertos ao mesmo tempo — isso é
  responsabilidade da lógica abaixo.

### Estado de nível vem dos alertas abertos, não da última leitura

O tipo de alerta que deve estar aberto sai de `nivelComHisterese(pct,
nivelAlertado)`, onde `nivelAlertado` é derivado dos **alertas abertos do
device** (carregados na mesma query do reservatório). Tudo que não for o alvo é
resolvido em toda leitura — inclusive quando nada mudou.

**Por que não usar o nível da última leitura:** era o que se fazia
(`if (nivelMudou)` comparando com `last_nivel`), e como o write-threshold
descarta a maioria das leituras, `last_nivel` fica velho — o `UPDATE ... SET
status='resolvido'` era pulado e os dois tipos ficavam abertos juntos.
Confirmado em produção: 5 pares coexistindo, o maior por 2min40s. Como efeito
colateral bom, a lógica nova **auto-cura** esse estado: ao ver os dois abertos,
assume o pior e resolve o outro na leitura seguinte.

### Histerese (`TELEMETRIA_HISTERESE_PCT`, default 5)

Piorar de faixa vale na fronteira nua (alerta sem atraso); **melhorar exige 5
pontos percentuais de folga**. Sem isso um nível parado em cima de uma fronteira
gera dezenas de alertas: os alertas são reprocessados a cada leitura (~10s) e o
ruído do ADC (±1,7% medido no device de teste) joga cada amostra para um lado.
Medido em 05/08/2026: uma única descida de 37% a 0% criou **17 alertas** onde
deveriam ser 2. Em simulação do mesmo cenário, a lógica nova fica em 2; com o
nível parado na fronteira por 20 min, cai de 35 alertas para 1.

O nível gravado em `leituras.nivel` continua **cru** — a histerese governa só os
alertas. A resposta do `POST /telemetria` expõe os dois: `nivel` (cru) e
`nivel_alerta` (com histerese).
- **Job offline** (`offline.job.js`): compara `last_seen` com `OFFLINE_MINUTES`;
  se estourou, faz upsert do alerta `dispositivo_offline`. Intervalo ajustável
  via `jobs.offline_intervalo_min`. Disparo manual: `POST /jobs/verificar-offline`.
- **Alerta crítico → ação automática**: alerta de telemetria crítico pode
  disparar abertura de chamado pela IA + notificação ao cliente via WhatsApp
  (integração Fase 4). Email de alerta crítico via `alertas.email_destinatario`.
- **Um evento, duas linhas no banco:** um nível baixo novo grava o alerta **e**
  abre chamado `[AUTO]` via `abrirChamadoAuto` (`nivel_baixo` → categoria
  `nivel_baixo`; `dispositivo_offline` do job → `bomba_falha`). Na página de
  Alertas os dois são **agrupados**: o chamado é o item exibido, com o selo
  "+ telemetria", e o alerta não gera card próprio (`_alChamadoDoAlerta` em
  `public/admin.js`). Badge do menu e KPI "Alertas críticos" contam pela mesma
  lista, senão diriam 2 para o que a tela mostra como 1. Um chamado que absorveu
  telemetria conta como alerta mesmo sendo P3/P4, e herda a maior severidade
  entre as duas origens.
- **Vários reservatórios no mesmo condomínio:** `abrirChamadoAuto` deduplica por
  `condominio_id + categoria`, então 2 reservatórios em nível baixo no mesmo
  condomínio geram **1 chamado**, e o agrupamento absorve os dois alertas nele.
  A lista mostra `+ telemetria ×2` e "N reservatórios"; o painel lateral lista
  device + tipo de cada um. É condensação intencional — o backend já trata os
  dois como o mesmo problema.
- **O que conta como alerta na página de Alertas** (corrigido em 08/09/2026,
  `_alContaComoAlerta` em `public/admin.js`): telemetria **sempre**; chamado só
  quando é **P1 ou P2**, quando **estourou o prazo** (aí a prioridade não
  importa — um P4 atrasado é alerta), quando **absorveu um alerta de
  telemetria** (senão o evento sumiria da tela ao ser agrupado) ou quando
  **nasceu da telemetria** (prefixo `[AUTO]` no título).
  ⚠️ **`[AUTO]` é o que salva o passado.** `telemetriaAbsorvida` se calcula
  sobre os alertas **abertos**: assim que o nível normaliza, o chamado P3 que
  só era alerta por causa dele sumiria da aba "Resolvidos", e a tela perderia o
  histórico do evento que a fez existir. O prefixo é gravado por
  `abrirChamadoAuto` e **sobrevive ao fechamento**.
  ⚠️ **Preventiva NUNCA é alerta, e o corte é pela ORIGEM**
  (`plano_manutencao_id`), não pela prioridade — a mesma decisão que a tirou da
  lista de chamados do admin em 04/09. Elas são P4 e já cairiam pela
  prioridade, mas o job gera uma por prédio por mês (**69 de uma vez em
  setembro**) e no fim do mês um lote inteiro estoura prazo junto: voltariam
  como "alerta crítico" em bloco. Têm tela e cadência próprias.
  ⚠️ **A regra existia desde antes e a tabela não a aplicava.** O badge do menu
  e o KPI do dashboard já filtravam; `renderAlertas()` passava o `_alUnificar()`
  cru — que empurra TODO chamado para dentro — e o `_alAplicarFiltros()` só
  filtra por aba, tipo, busca e data. Um P4 agendado virava card de alerta, e
  os contadores das abas o contavam.
  ⚠️ **O sintoma era composto:** a tela mostrava MAIS itens do que o número que
  a anunciava. É a mesma contradição que este módulo registra como "8 aqui e 7
  em Alertas" — dada por resolvida quando só o KPI e o badge foram corrigidos.
  **A pergunta "isto é um alerta?" tem UM dono agora**, e a lista desenhada sai
  da mesma função que a lista contada. Travado em
  `scripts/testes/alertas-so-o-que-e-alerta.test.js`.
- **Fechar o chamado não fecha o alerta de telemetria.** O alerta é estado
  físico: some quando o nível normaliza (ou reabre em ~10s se ainda estiver
  baixo). Fechado o chamado, o alerta volta a aparecer como card próprio.

## Extravasamento

Etapa 1, só software (24/11/2026, migration 106). A regra fica em
`src/services/extravasor.service.js`, sem banco; o `POST /telemetria` só lê e
grava o estado. O porquê está em
[decisions.md](../../memory-bank/decisions.md).

⚠️ **Extravasamento não é "nível acima de 100%".** Quando a água extravasa, o
nível para na altura do ladrão e o excesso sai pelo cano. Um reservatório
cheio com a boia fechada também fica parado no alto, poucos centímetros abaixo
dele. O ruído da sonda (±1,7%, uns 3 cm numa caixa de 2 m) é do tamanho dessa
folga. Por isso:

1. **O ladrão é cadastrado por reservatório**: `altura_extravasor_m`, em
   metros, na mesma referência de `altura_total_m` (o zero da sonda). Vazio =
   detecção desligada. Fica no modal "Editar reservatório" do admin novo.
   A altura da água é calculada **sem o teto de 100%** do `calcularNivelPct`:
   com o ladrão na altura total, o teto esconderia justamente o que se procura.
2. **Entrar e sair**: conta como "no ladrão" a partir de
   `telemetria.extravasor_tolerancia_cm` (padrão 2) abaixo dele; para sair,
   precisa descer mais `telemetria.extravasor_histerese_cm` (padrão 3). Entre
   as duas alturas, mantém o estado anterior.
3. **Tempo**: o alerta só sai depois de `telemetria.extravasor_minutos`
   (padrão 10) seguidos no ladrão, **ou** de
   `telemetria.extravasor_bomba_minutos` (padrão 3) no ladrão **com a bomba
   ligada**. Esse segundo é o sinal forte: na caixa superior a boia elétrica
   já deveria ter desligado o recalque.
4. **Relógio no banco**: `extravasor_desde` e `extravasor_bomba_desde` em
   `reservatorios`, gravados só quando mudam. Não fica na memória porque o
   deploy reinicia o processo; não fica em `leituras` porque o write-threshold
   descarta a maioria das amostras. Leitura que chega mais de **5 min** depois
   da anterior (`last_seen`) recomeça o relógio, porque não se sabe o que
   houve no meio. Mudar a altura do ladrão no PATCH também zera o relógio.

O alerta tem o tipo `extravasamento`. Quando ele é **novo**, sai o e-mail de
alerta e o chamado `[AUTO]` na categoria **`vazamento`**: P3 pela regra do
nível, P2 pela regra da bomba. Se a bomba ligar com o alerta já aberto, o
chamado sobe para P2 (só no primeiro minuto depois de a regra vencer, para não
consultar chamado a cada 10 s). Não foi criada categoria nova porque a lista
de categorias é a régua contratual de prioridade (`prioridade.service.js`).
Na tela de Alertas o agrupamento liga `extravasamento` → `vazamento`
(`_AL_TIPO_PARA_CATEGORIA`). O alerta fecha quando o nível **sai** do ladrão;
ainda no ladrão, fica aberto.

**Limite conhecido:** a cisterna enchida pela rua (boia mecânica, sem bomba) só
tem a regra do nível, que é a parte menos precisa. A certeza ali vem da etapa
2, que exige hardware: um sensor no próprio cano do ladrão, uma entrada nova
no ESP32 e um campo a mais no `POST /telemetria`.

Teste: `scripts/testes/extravasamento.test.js` (regra pura + rotas contra o
banco de teste).

## Consumo

- **Admin:** `GET /admin/status` (agregado por condomínio + lat/lng/endereço),
  `GET /admin/historico?device_ids=A,B&horas=N` (buckets agregados, até 10
  devices), seção Telemetria avançada, mapa Leaflet, `/alertas` unificada.
- **Cliente:** `GET /cliente/status` e `GET /cliente/historico` (escopo do
  próprio condomínio).
- **Relatório PDF:** `GET /relatorio/pdf` (Puppeteer).

⚠️ **`/admin/historico` devolve `{ horas, bucket_sec, series: { <device>: [...] } }`.**
Ler `j[device]` sem o `series` não dá erro: dá lista vazia, e a tela diz "sem
leituras" com o sensor funcionando. Foi assim no gráfico do Monitoramento e no
do detalhe de alerta (admin novo e legado) até 24/11/2026.

### Faixas e situação na tela (24/11/2026)

- **As faixas (45% / 20%) têm uma cópia no servidor**: `LIMIARES_NIVEL` em
  `src/config.js`, lida pelo alerta (`nivelFromPct`), pelo operador e
  devolvida ao cliente em `GET /cliente/status` → `limiares`. O Monitoramento
  do admin repete as duas no topo (`FAIXA`), porque o `/admin/status` é uma
  lista sem lugar para levá-las.
- **A situação mostrada é o PIOR entre o número e o alerta aberto**, no
  Monitoramento (`reservatorios()`) e no cliente (`estadoDo`). O alerta tem
  histerese: a 47% com `nivel_baixo` ainda aberto, a tela que só olhava o
  número dizia "Normal" com "1 alerta" ao lado. E o extravasamento só existe
  como alerta: sem olhar os alertas, o prédio extravasando aparecia
  "abastecido". No cliente ele é o estado `extravasando` (depois de crítico,
  sem sinal e baixo), com desenho âmbar e manchete "está no nível do ladrão".

## Retenção

A tabela `leituras` cresce ~1 linha por device a cada poucos minutos (~86k
linhas/dia em 100 condomínios × 3 reservatórios). Decisão de escopo: histórico
> 60 dias **não é necessário** no produto, então a estratégia é **só retenção**
(sem tabelas agregadas — ver [`../../memory-bank/decisions.md`](../../memory-bank/decisions.md)). Sem limpeza:
~3,6 GB/ano crescendo; com retenção de 60 dias estabiliza em ~600 MB.

`leituras-cleanup.job.js` (`leituras.retencao_dias`, default 60),
`alertas-cleanup.job.js` (`alertas.retencao_dias`, default 365) e
`conversas-cleanup.job.js` (`conversas.retencao_dias`, default 365) seguem o
mesmo padrão de segurança:

- `setTimeout` recursivo, 1×/dia; primeira execução escalonada após o boot
  (leituras 10min, alertas 15min, conversas 20min) para não disputar o pool.
- **DELETE em lotes** (10k leituras / 1k alertas / 500 conversas) para não
  segurar locks longos nem inchar o WAL.
- **Cap de lotes** por execução (ex.: 200 = 2M linhas) → marca `truncado:true`
  e o admin vê aviso "talvez precise rodar de novo".
- **Hard floor** (leituras 7 dias, alertas/conversas 30 dias) — protege contra
  erro de digitação que apagaria tudo.
- **Modo `dry_run`** (`*.cleanup_dry_run`): faz só `COUNT(*)` e retorna
  `seriam_removidos: N` sem apagar — usado na 1ª execução em produção.
- Disparo manual: `POST /admin/jobs/{leituras,alertas,conversas}-cleanup/run`
  (masterAdmin, respeita o dry-run). UI em **Configurações → Manutenção**.

Detalhes de FK no cleanup: alertas apaga `alerta_comentarios` de telemetria
junto (CTE, pois não há FK); conversas cascateia `mensagens_whatsapp` e zera
`chamados.conversa_id` (SET NULL). O DELETE de conversas **não** mexe no
histórico do WhatsApp do cliente — só na cópia local da central.
