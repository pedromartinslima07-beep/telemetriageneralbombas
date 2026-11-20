-- 096 — Clientes do Omie e o elo do contrato com o prédio (20/11/2026).
-- Integração com o Omie, fase 1 (docs/modulos/omie-integracao.md).
--
-- A cópia dos contratos do Omie (`omie_contratos`, migration 092) guarda só o
-- código do cliente de lá (`nCodCli`). Sem o CNPJ dele não havia como dizer de
-- qual prédio é cada contrato, e a tela de contratos do sistema seguia vazia
-- com 81 contratos ativos no Omie.
--
-- - `omie_clientes`: cópia dos clientes do Omie (`geral/clientes ListarClientes`),
--   refeita pelo mesmo job do faturamento. `documento` é o CNPJ/CPF só em
--   dígitos: é por ele que o contrato encontra o prédio (`condominios.cnpj`,
--   comparado também só em dígitos).
-- - `omie_cliente_vinculos`: o elo feito À MÃO, para o cliente cujo CNPJ não
--   bate com nenhum prédio (ou bate com mais de um). Vale sobre o do CNPJ, e a
--   sincronização nunca mexe nesta tabela. Apagar a linha volta ao automático.
--
-- Só leitura do Omie: nada aqui grava lá. Aditiva e idempotente. ⚠️ O código
-- da tela de contratos lê estas tabelas: rodar em PRODUÇÃO ANTES do push
-- (push na main = deploy), depois de 090 a 095.

CREATE TABLE IF NOT EXISTS omie_clientes (
  omie_codigo    BIGINT PRIMARY KEY,           -- codigo_cliente_omie (= nCodCli do contrato)
  documento      VARCHAR(14),                  -- CNPJ/CPF só dígitos
  razao_social   TEXT,
  nome_fantasia  TEXT,
  email          TEXT,
  cidade         TEXT,
  inativo        BOOLEAN NOT NULL DEFAULT FALSE,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS omie_clientes_documento_idx ON omie_clientes (documento);

CREATE TABLE IF NOT EXISTS omie_cliente_vinculos (
  omie_cliente   BIGINT PRIMARY KEY,           -- omie_clientes.omie_codigo (sem FK: a cópia é refeita)
  condominio_id  INTEGER NOT NULL REFERENCES condominios(id) ON DELETE CASCADE,
  ligado_por     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  ligado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS omie_cliente_vinculos_condo_idx ON omie_cliente_vinculos (condominio_id);
