-- Adiciona nivel_pct (0-100) à tabela leituras
ALTER TABLE leituras
  ADD COLUMN IF NOT EXISTS nivel_pct smallint CHECK (nivel_pct >= 0 AND nivel_pct <= 100);

-- Índice composto para queries do endpoint /cliente/historico
CREATE INDEX IF NOT EXISTS idx_leituras_device_criado
  ON leituras (device_id, criado_em DESC);
