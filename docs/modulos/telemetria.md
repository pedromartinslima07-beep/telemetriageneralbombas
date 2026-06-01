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
8. **Geração/resolução de alertas de nível** por transição de estado
   (alto / médio / baixo / muito_baixo), via `alertas.service.js`.

## Alertas

- Tabela `alertas`, chaveada por `device_id` + `tipo`, com índice **parcial
  único** `uniq_alerta_aberto WHERE status='aberto'` → garante no máximo 1
  alerta aberto por device+tipo (upsert idempotente).
- **Job offline** (`offline.job.js`): compara `last_seen` com `OFFLINE_MINUTES`;
  se estourou, faz upsert do alerta `dispositivo_offline`. Intervalo ajustável
  via `jobs.offline_intervalo_min`. Disparo manual: `POST /jobs/verificar-offline`.
- **Alerta crítico → ação automática**: alerta de telemetria crítico pode
  disparar abertura de chamado pela IA + notificação ao cliente via WhatsApp
  (integração Fase 4). Email de alerta crítico via `alertas.email_destinatario`.

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
