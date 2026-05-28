-- Migration 036 — Origem do orçamento
--
-- Antes não dava pra distinguir um orçamento criado manualmente pelo admin
-- de um criado a partir de uma OS (técnico marca "preciso de orçamento")
-- ou de um pedido recebido pelo bot do WhatsApp.
--
-- Com a coluna `origem` o filtro é explícito e a UI pode destacar pedidos
-- novos vindos da IA pra equipe comercial priorizar.

BEGIN;

ALTER TABLE orcamentos
  ADD COLUMN IF NOT EXISTS origem VARCHAR(10) NOT NULL DEFAULT 'admin'
    CHECK (origem IN ('admin','ia','os'));

-- Backfill: registros existentes com os_id IS NOT NULL vieram do fluxo
-- da OS (técnico → admin); o resto foi criado manualmente pelo admin.
UPDATE orcamentos
   SET origem = CASE WHEN os_id IS NOT NULL THEN 'os' ELSE 'admin' END
 WHERE origem = 'admin';

-- Index parcial pra query "orçamentos novos vindos da IA aguardando triagem"
CREATE INDEX IF NOT EXISTS idx_orcamentos_ia_rascunho
  ON orcamentos (criado_em DESC)
  WHERE origem = 'ia' AND status = 'rascunho';

COMMIT;
