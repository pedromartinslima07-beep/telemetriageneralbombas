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
- **Fechar o chamado não fecha o alerta de telemetria.** O alerta é estado
  físico: some quando o nível normaliza (ou reabre em ~10s se ainda estiver
  baixo). Fechado o chamado, o alerta volta a aparecer como card próprio.

## Consumo

- **Admin:** `GET /admin/status` (agregado por condomínio + lat/lng/endereço),
  `GET /admin/historico?device_ids=A,B&horas=N` (buckets agregados, até 10
  devices), seção Telemetria avançada, mapa Leaflet, `/alertas` unificada.
- **Cliente:** `GET /cliente/status` e `GET /cliente/historico` (escopo do
  próprio condomínio).
- **Relatório PDF:** `GET /relatorio/pdf` (Puppeteer).

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
