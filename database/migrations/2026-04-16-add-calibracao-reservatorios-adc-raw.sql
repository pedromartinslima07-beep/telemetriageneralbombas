-- Migration: adiciona campos de calibração em reservatorios e adc_raw em leituras
-- Para que o servidor calcule nivel_pct a partir do valor ADC bruto da sonda

-- Calibração do reservatório
ALTER TABLE reservatorios
  ADD COLUMN altura_total_m  NUMERIC(5,2),
  ADD COLUMN adc_zero        INT,
  ADD COLUMN adc_por_metro   INT,
  ADD COLUMN faixa_sonda_m   NUMERIC(5,2);

-- Valor bruto do ADC enviado pelo ESP32
ALTER TABLE leituras
  ADD COLUMN adc_raw INT;
