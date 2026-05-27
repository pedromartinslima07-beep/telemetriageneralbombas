-- Migration 035 — Contratos
--
-- Antes o sistema sabia que todo condomínio é cliente com contrato, mas
-- nada guardava valor, vigência, tipo de plano ou forma de pagamento.
-- Isso bloqueia alertas de renovação, cálculo de MRR e qualquer relatório
-- financeiro.
--
-- Modelo: 1 condomínio pode ter histórico de contratos (renovações criam
-- novos registros, antigos viram ativo=false), mas só 1 contrato ativo
-- por vez. UNIQUE parcial garante isso.

BEGIN;

CREATE TABLE IF NOT EXISTS contratos (
  id                   SERIAL PRIMARY KEY,
  condominio_id        INTEGER NOT NULL REFERENCES condominios(id) ON DELETE CASCADE,
  numero               VARCHAR(40),                  -- ex: "CT-2026-0001" ou manual
  tipo                 VARCHAR(20) NOT NULL CHECK (tipo IN ('mensal','anual','avulso')),
  valor_mensal         NUMERIC(10,2) NOT NULL CHECK (valor_mensal >= 0),
  inicio_em            DATE NOT NULL,
  fim_em               DATE,                         -- NULL = sem fim definido
  renovacao_automatica BOOLEAN NOT NULL DEFAULT FALSE,
  forma_pagamento      VARCHAR(30),                  -- boleto|pix|transferencia|cartao|outro
  dia_vencimento       SMALLINT CHECK (dia_vencimento BETWEEN 1 AND 28),
  observacoes          TEXT,
  ativo                BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_por           INTEGER REFERENCES usuarios(id)
);

-- Lookup principal: contrato ativo de um condomínio (1 por vez)
CREATE UNIQUE INDEX IF NOT EXISTS idx_contratos_ativo_uniq
  ON contratos (condominio_id)
  WHERE ativo = TRUE;

-- Pra query "vencendo em X dias" (janela móvel)
CREATE INDEX IF NOT EXISTS idx_contratos_fim_em
  ON contratos (fim_em)
  WHERE ativo = TRUE AND fim_em IS NOT NULL;

-- Pra listar histórico por condomínio
CREATE INDEX IF NOT EXISTS idx_contratos_condo_hist
  ON contratos (condominio_id, criado_em DESC);

COMMIT;
