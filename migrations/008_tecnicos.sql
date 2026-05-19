CREATE TABLE IF NOT EXISTS tecnicos (
  id          SERIAL PRIMARY KEY,
  nome        TEXT NOT NULL,
  email       TEXT,
  telefone    TEXT,
  especialidade TEXT,
  disponivel  BOOLEAN NOT NULL DEFAULT true,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
