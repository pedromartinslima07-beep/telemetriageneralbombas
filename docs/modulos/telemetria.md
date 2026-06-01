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

`leituras-cleanup.job.js` (`leituras.retencao_dias`, default ~60) e
`alertas-cleanup.job.js` (`alertas.retencao_dias`) com modo `dry_run` para
verificação antes de deletar.
