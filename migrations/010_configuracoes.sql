-- Migration 010: Configurações dinâmicas (key-value)
-- Permite ao master admin editar comportamento da IA, intervalo de jobs,
-- destinatário de alertas etc. sem precisar de redeploy.

CREATE TABLE IF NOT EXISTS configuracoes (
  chave           VARCHAR(64) PRIMARY KEY,
  valor           TEXT,
  atualizado_em   TIMESTAMPTZ DEFAULT NOW(),
  atualizado_por  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL
);

-- Valores padrão. Não substitui se a chave já existir (idempotente).
INSERT INTO configuracoes (chave, valor) VALUES
  ('ia.enabled',          'true'),
  ('ia.modelo',           'gpt-4o-mini'),
  ('ia.system_prompt',    ''),
  ('alertas.email_destinatario', ''),
  ('jobs.offline_intervalo_min', '1')
ON CONFLICT (chave) DO NOTHING;
