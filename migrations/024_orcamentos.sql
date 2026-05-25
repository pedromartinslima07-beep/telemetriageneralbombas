-- Migration 024 — Orçamentos formais (Fase 7K)
-- Adiciona rastreamento de status/valor do orçamento diretamente na ordens_servico.
-- O técnico já preenche orcamento_necessario + orcamento_observacoes (Migration 018).
-- O admin usa estas novas colunas para registrar o valor formal e aprovar/rejeitar.

ALTER TABLE ordens_servico
  ADD COLUMN IF NOT EXISTS orcamento_valor       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS orcamento_status      VARCHAR(20)  DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS orcamento_valido_ate  DATE,
  ADD COLUMN IF NOT EXISTS orcamento_aprovado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS orcamento_aprovado_por INTEGER REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS orcamento_motivo_rejeicao TEXT;

-- Índice parcial para a página de orçamentos (query rápida sem varrer a tabela toda)
CREATE INDEX IF NOT EXISTS idx_os_orcamento_pendente
  ON ordens_servico(finalizada_em DESC)
  WHERE orcamento_necessario = TRUE;
