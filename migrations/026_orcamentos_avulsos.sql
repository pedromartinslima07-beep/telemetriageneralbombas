-- Migration 026 — Orçamentos independentes (criados direto no admin, sem OS)

CREATE TABLE IF NOT EXISTS orcamentos (
  id               SERIAL PRIMARY KEY,
  numero           VARCHAR(30),
  condominio_id    INTEGER REFERENCES condominios(id),
  status           VARCHAR(20) NOT NULL DEFAULT 'rascunho',
  constatacao      TEXT,
  forma_pagamento  VARCHAR(255) DEFAULT 'Via boleto bancário',
  prazo_entrega    VARCHAR(100) DEFAULT '5 dias úteis após aprovação',
  garantia         VARCHAR(100) DEFAULT '12 meses por defeito de fabricação',
  disponibilidade  VARCHAR(100) DEFAULT 'Total',
  valido_ate       DATE,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_por       INTEGER REFERENCES usuarios(id)
);
CREATE INDEX IF NOT EXISTS idx_orcamentos_condo ON orcamentos(condominio_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_status ON orcamentos(status);

CREATE TABLE IF NOT EXISTS orcamento_linhas (
  id             SERIAL PRIMARY KEY,
  orcamento_id   INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  descricao      TEXT NOT NULL,
  ficha_tecnica  TEXT,
  quantidade     INTEGER NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  valor_unitario NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (valor_unitario >= 0),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orc_linhas_orc ON orcamento_linhas(orcamento_id);
