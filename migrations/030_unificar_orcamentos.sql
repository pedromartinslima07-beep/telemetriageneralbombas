-- Migration 029 — Unificação do sistema de orçamentos
--
-- Antes: havia 2 sistemas em paralelo:
--   A) Colunas `orcamento_*` em ordens_servico + tabela `orcamento_itens`
--      (criado nas migrations 018, 024, 025)
--   B) Tabelas `orcamentos` + `orcamento_linhas` (criado na 026, 027)
--
-- Depois: orçamento formal vive APENAS em `orcamentos`/`orcamento_linhas`.
-- Em `ordens_servico` ficam somente os campos da etapa do técnico (input no app):
--   - `orcamento_necessario` BOOLEAN  (o técnico marca "preciso de orçamento")
--   - `orcamento_observacoes` TEXT    (descrição livre do que ele constatou)
-- O admin transforma essa solicitação em orçamento formal na tabela `orcamentos`,
-- ligado por `orcamentos.os_id`.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Adiciona em `orcamentos` as colunas que hoje só existem no sistema A
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE orcamentos
  ADD COLUMN IF NOT EXISTS valor            NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS aprovado_em      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aprovado_por     INTEGER REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS motivo_rejeicao  TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Backfill: cria registro em `orcamentos` para cada OS com
--    orcamento_necessario=true que ainda não tem um vinculado.
--    Mapa de status: pendente → rascunho, demais 1:1.
-- ─────────────────────────────────────────────────────────────────────────────
WITH novos AS (
  INSERT INTO orcamentos (
    os_id,
    numero,
    condominio_id,
    status,
    constatacao,
    forma_pagamento,
    prazo_entrega,
    garantia,
    disponibilidade,
    valido_ate,
    valor,
    aprovado_em,
    aprovado_por,
    motivo_rejeicao,
    criado_em
  )
  SELECT
    os.id,
    COALESCE(os.orcamento_numero, 'OR-OS-' || os.id),
    os.condominio_id,
    CASE COALESCE(os.orcamento_status, 'pendente')
      WHEN 'pendente'  THEN 'rascunho'
      WHEN 'aprovado'  THEN 'aprovado'
      WHEN 'rejeitado' THEN 'rejeitado'
      ELSE 'rascunho'
    END,
    os.orcamento_constatacao,
    COALESCE(os.orcamento_forma_pagamento, 'Via boleto bancário'),
    COALESCE(os.orcamento_prazo_entrega,   '5 dias úteis após aprovação'),
    COALESCE(os.orcamento_garantia,        '12 meses por defeito de fabricação'),
    COALESCE(os.orcamento_disponibilidade, 'Total'),
    os.orcamento_valido_ate,
    os.orcamento_valor,
    os.orcamento_aprovado_em,
    os.orcamento_aprovado_por,
    os.orcamento_motivo_rejeicao,
    COALESCE(os.finalizada_em, os.criado_em)
  FROM ordens_servico os
  WHERE os.orcamento_necessario = TRUE
    AND NOT EXISTS (SELECT 1 FROM orcamentos o WHERE o.os_id = os.id)
  RETURNING id, os_id
)
-- Move itens de orcamento_itens (sistema A) → orcamento_linhas (sistema B)
-- para os orçamentos recém-criados.
INSERT INTO orcamento_linhas (
  orcamento_id, descricao, ficha_tecnica, quantidade, valor_unitario, criado_em
)
SELECT n.id, i.descricao, i.ficha_tecnica, i.quantidade, i.valor_unitario, i.criado_em
FROM orcamento_itens i
JOIN novos n ON n.os_id = i.os_id;

-- 2b) Para OSs que já tinham orçamento avulso vinculado mas que também tinham
--     orcamento_itens órfãos (caso de borda): move os itens pro orçamento
--     existente, evitando duplicar quem já tem linha idêntica.
INSERT INTO orcamento_linhas (
  orcamento_id, descricao, ficha_tecnica, quantidade, valor_unitario, criado_em
)
SELECT o.id, i.descricao, i.ficha_tecnica, i.quantidade, i.valor_unitario, i.criado_em
FROM orcamento_itens i
JOIN orcamentos o ON o.os_id = i.os_id
LEFT JOIN orcamento_linhas l
  ON l.orcamento_id = o.id
 AND l.descricao    = i.descricao
 AND l.quantidade   = i.quantidade
 AND l.valor_unitario = i.valor_unitario
WHERE l.id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Limpa o sistema A: dropa as 12 colunas formais de ordens_servico
--    (mantém apenas orcamento_necessario + orcamento_observacoes, que são
--    o input do técnico no app)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE ordens_servico
  DROP COLUMN IF EXISTS orcamento_valor,
  DROP COLUMN IF EXISTS orcamento_status,
  DROP COLUMN IF EXISTS orcamento_valido_ate,
  DROP COLUMN IF EXISTS orcamento_aprovado_em,
  DROP COLUMN IF EXISTS orcamento_aprovado_por,
  DROP COLUMN IF EXISTS orcamento_motivo_rejeicao,
  DROP COLUMN IF EXISTS orcamento_numero,
  DROP COLUMN IF EXISTS orcamento_constatacao,
  DROP COLUMN IF EXISTS orcamento_forma_pagamento,
  DROP COLUMN IF EXISTS orcamento_prazo_entrega,
  DROP COLUMN IF EXISTS orcamento_garantia,
  DROP COLUMN IF EXISTS orcamento_disponibilidade;

-- 4) Dropa tabela de itens do sistema A (dados já migrados para orcamento_linhas)
DROP TABLE IF EXISTS orcamento_itens;

COMMIT;
