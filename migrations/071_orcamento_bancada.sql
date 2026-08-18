-- Migration 071 — Orçamento da bancada (Fase 12B)
--
-- Liga o módulo de equipamentos ao sistema de orçamentos, que já existe
-- inteiro. A migration 070 já tinha deixado a fiação do lado do equipamento
-- (`equipamento_movimentacoes.orcamento_id`, tipos `orcamento_solicitado` e
-- `orcamento_aprovado`, status `aguardando_orcamento`) — faltava o lado do
-- orçamento saber de qual bomba ele veio.
--
-- Nenhuma tabela nova: o orçamento da bancada é um `orcamentos` comum, com as
-- peças como `orcamento_linhas`. Criar um sistema paralelo de peças seria
-- repetir o erro que a migration 030 levou meses para desfazer.

-- 1. `origem` ganha 'bancada' — cabe em VARCHAR(10).
ALTER TABLE orcamentos DROP CONSTRAINT IF EXISTS orcamentos_origem_check;
ALTER TABLE orcamentos
  ADD CONSTRAINT orcamentos_origem_check
  CHECK (origem IN ('admin', 'ia', 'os', 'bancada'));

-- 2. O caminho de volta: do orçamento para a bomba.
--
-- SET NULL, não CASCADE: dar baixa num equipamento não pode apagar o orçamento
-- — ele é documento comercial e pode já ter sido enviado ao cliente.
ALTER TABLE orcamentos
  ADD COLUMN IF NOT EXISTS equipamento_id INTEGER REFERENCES equipamentos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orcamentos_equipamento ON orcamentos(equipamento_id);
