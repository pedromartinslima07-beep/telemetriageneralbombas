-- 106 — Detecção de extravasamento pelo nível (24/11/2026).
-- docs/modulos/telemetria.md, seção "Extravasamento".
--
-- Quando a água extravasa, o nível NÃO passa de 100%: ele para na altura do
-- ladrão e o excesso sai pelo cano. Um reservatório cheio com a boia fechada
-- também fica parado no alto, poucos centímetros abaixo. Por isso a regra não
-- pode ser uma porcentagem fixa — precisa saber onde fica o ladrão de CADA
-- reservatório, medido pelo técnico na visita.
--
-- `altura_extravasor_m` — altura do ladrão (borda inferior do cano), em metros,
--   na MESMA referência de `altura_total_m` (o zero da sonda). NULL = não
--   cadastrado = a detecção fica desligada para este reservatório.
--
-- `extravasor_desde` — desde quando o nível está no ladrão, sem interrupção.
-- `extravasor_bomba_desde` — desde quando está no ladrão COM a bomba ligada.
--   Os dois são o relógio da regra de tempo: o alerta só sai depois de N
--   minutos seguidos (configurável em `telemetria.extravasor_*`), para que o
--   ruído da sonda (±1,7% medido) não vire alerta. Viver em colunas, e não na
--   memória do processo, porque o deploy reinicia o servidor e o relógio
--   voltaria a zero; e não em `leituras`, porque o write-threshold descarta a
--   maioria das amostras.
--
-- Aditiva e idempotente. ⚠️ O código lê estas colunas: rodar em PRODUÇÃO
-- antes do push (o push na main é o deploy).

ALTER TABLE reservatorios ADD COLUMN IF NOT EXISTS altura_extravasor_m    NUMERIC(6,3);
ALTER TABLE reservatorios ADD COLUMN IF NOT EXISTS extravasor_desde       TIMESTAMPTZ;
ALTER TABLE reservatorios ADD COLUMN IF NOT EXISTS extravasor_bomba_desde TIMESTAMPTZ;
