-- Migration 025 — Itens do orçamento formal (Fase 7K)
-- Permite criar orçamentos completos com itens, ficha técnica e geração de PDF.

CREATE SEQUENCE IF NOT EXISTS orcamento_numero_seq;

-- Tabela de itens do orçamento (1 OS pode ter N itens)
CREATE TABLE IF NOT EXISTS orcamento_itens (
  id              SERIAL PRIMARY KEY,
  os_id           INTEGER NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
  descricao       TEXT NOT NULL,
  ficha_tecnica   TEXT,           -- specs técnicas (texto livre, ex: "Marca: Weg\nPotência: 1.5cv")
  quantidade      INTEGER NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  valor_unitario  NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (valor_unitario >= 0),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orc_itens_os ON orcamento_itens(os_id);

-- Colunas extras no orçamento da OS
ALTER TABLE ordens_servico
  ADD COLUMN IF NOT EXISTS orcamento_numero          VARCHAR(30),
  ADD COLUMN IF NOT EXISTS orcamento_constatacao     VARCHAR(255),
  ADD COLUMN IF NOT EXISTS orcamento_forma_pagamento VARCHAR(255) DEFAULT 'Via boleto bancário',
  ADD COLUMN IF NOT EXISTS orcamento_prazo_entrega   VARCHAR(100) DEFAULT '5 dias úteis após aprovação',
  ADD COLUMN IF NOT EXISTS orcamento_garantia        VARCHAR(100) DEFAULT '12 meses por defeito de fabricação',
  ADD COLUMN IF NOT EXISTS orcamento_disponibilidade VARCHAR(100) DEFAULT 'Total';

-- CNPJ do condomínio (usado no PDF do orçamento)
ALTER TABLE condominios
  ADD COLUMN IF NOT EXISTS cnpj VARCHAR(18);
