-- Migration: limiar configurável da bomba e histórico do RMS bruto
-- ESP32 envia o valor RMS do sensor SCT-013; o servidor decide se a bomba
-- está ligada comparando com limiar_bomba (por reservatório).

-- Limiar de detecção da bomba (por reservatório)
ALTER TABLE reservatorios
  ADD COLUMN limiar_bomba INT;

-- RMS bruto enviado pelo ESP32 (histórico, ajuda a calibrar o limiar)
ALTER TABLE leituras
  ADD COLUMN bomba_rms INT;
