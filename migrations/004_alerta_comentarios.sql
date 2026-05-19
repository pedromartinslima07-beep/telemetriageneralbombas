-- Comentários nos alertas (telemetria + chamados). Tabela única, identifica
-- a origem por 'alerta_origem' + 'alerta_id'. Sem FK direta porque as duas
-- tabelas-origem existem (alertas, chamados) e a integridade é checada na
-- camada de aplicação.

CREATE TABLE IF NOT EXISTS alerta_comentarios (
  id            SERIAL PRIMARY KEY,
  alerta_origem VARCHAR(20) NOT NULL CHECK (alerta_origem IN ('telemetria','chamado')),
  alerta_id     INTEGER     NOT NULL,
  autor_id      INTEGER     REFERENCES usuarios(id) ON DELETE SET NULL,
  texto         TEXT        NOT NULL,
  criado_em     TIMESTAMPTZ DEFAULT NOW()
);

-- Busca rápida dos comentários de um alerta específico
CREATE INDEX IF NOT EXISTS idx_alerta_comentarios_alerta
  ON alerta_comentarios (alerta_origem, alerta_id, criado_em DESC);
