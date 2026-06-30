-- Zona de atendimento do condomínio (texto livre: "Zona Sul", "Osasco", etc.)
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS zona VARCHAR(100);

-- Responsável técnico por zona para planos de manutenção preventiva.
-- Cada zona tem no máximo um técnico ativo; o admin atualiza conforme necessário.
CREATE TABLE IF NOT EXISTS planos_zona_responsavel (
  zona          VARCHAR(100) PRIMARY KEY,
  tecnico_id    INTEGER REFERENCES tecnicos(id) ON DELETE SET NULL,
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);
