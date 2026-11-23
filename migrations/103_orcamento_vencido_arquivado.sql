-- 103 — Orçamento vencido é arquivado; lembrete 5 dias antes (23/11/2026).
-- docs/modulos/orcamentos-vencimento.md
--
-- Pedido do Pedro: a lista de orçamentos tinha 126 "pede ação", 111 deles
-- orçamentos ENVIADOS cuja validade passou sem resposta (jul–nov/2026).
--
-- 1. `orcamentos.arquivado_em`: o vencido sem resposta sai da fila. O status
--    continua 'enviado' DE PROPÓSITO — a tela do cliente, a resposta pelo
--    painel e os relatórios leem status, e o cliente que aprova um vencido
--    continua podendo aprovar. Arquivar é estado da LISTA do escritório, não
--    do documento. NULL = não arquivado.
--    `arquivado_por` NULL = arquivado pelo job (vencimento).
--    Mudar a validade para o futuro (ou tirar a validade) desarquiva; reenviar
--    o e-mail também.
--
-- 2. `orcamento_lembretes`: o lembrete "faltam N dias, podemos seguir?" ao
--    cliente. Uma linha por (orçamento, validade): o mesmo lembrete nunca sai
--    duas vezes, e quem estende a validade ganha um lembrete novo.
--    status: enviando → enviado | erro; sem_email (o orçamento não guardou
--    para quem foi enviado).
--
-- O apagar depois do arquivo NÃO tem coluna: é o job, por
-- `orcamento.apagar_dias` (config), e o DELETE passa pela lixeira da 089.
--
-- Aditiva e idempotente. ⚠️ O código lê estas colunas: rodar em PRODUÇÃO
-- ANTES do push (push na main = deploy). A migration NÃO arquiva nada: o
-- arquivamento dos vencidos é do job (ou de scripts/orcamentos-vencidos.js).

ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS arquivado_em TIMESTAMPTZ;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS arquivado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orcamentos_arquivado
  ON orcamentos (arquivado_em) WHERE arquivado_em IS NOT NULL;

CREATE TABLE IF NOT EXISTS orcamento_lembretes (
  id             SERIAL PRIMARY KEY,
  orcamento_id   INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  valido_ate     DATE NOT NULL,              -- a validade que o lembrete anunciou
  dias           INTEGER,                    -- dias até vencer quando saiu
  destinatarios  TEXT,                       -- cópia de orcamentos.enviado_para na hora
  status         VARCHAR(12) NOT NULL DEFAULT 'enviando',
  erro           TEXT,
  tentativas     INTEGER NOT NULL DEFAULT 0,
  email_id       VARCHAR(80),                -- id do Resend
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enviado_em     TIMESTAMPTZ,
  UNIQUE (orcamento_id, valido_ate)
);
CREATE INDEX IF NOT EXISTS orcamento_lembretes_status_idx ON orcamento_lembretes (status);
