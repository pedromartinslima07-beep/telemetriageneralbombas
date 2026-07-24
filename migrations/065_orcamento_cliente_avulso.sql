-- Migration 065 — Cliente avulso (pessoa física) em orçamentos
--
-- Permite emitir orçamento para um cliente NÃO cadastrado (sem condomínio/CNPJ).
-- Quando `condominio_id` é NULL, o orçamento usa estes campos livres para o
-- bloco "Cliente" do PDF. Quando há condomínio, estes ficam nulos e prevalece
-- o cadastro do condomínio (comportamento atual).

ALTER TABLE orcamentos
  ADD COLUMN IF NOT EXISTS cliente_nome      VARCHAR(200),
  ADD COLUMN IF NOT EXISTS cliente_documento VARCHAR(30),   -- CPF ou CNPJ (texto livre)
  ADD COLUMN IF NOT EXISTS cliente_endereco  VARCHAR(255),
  ADD COLUMN IF NOT EXISTS cliente_email     VARCHAR(255);
