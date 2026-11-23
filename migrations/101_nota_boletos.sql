-- 101 — O boleto sai junto com a nota do orçamento (23/11/2026).
-- docs/modulos/nota-fiscal.md, seção "Banco e boleto".
--
-- Pedido do Pedro: ao emitir a nota pelo sistema, escolher o banco
-- (Sicredi ou Bradesco), as parcelas e os vencimentos, e o sistema pede ao
-- Omie para gerar o boleto de cada parcela (`GerarBoleto`). O Sicredi
-- registra sozinho pela API; o Bradesco precisa da remessa, que o Pedro
-- continua tirando no Omie (o sistema NÃO gera remessa: o Omie também gera,
-- e o número sequencial de duas fontes se atropelaria no banco).
--
-- - `orcamentos.nota_conta_corrente`: a conta do Omie em que a nota cobra
--   (5960922842 Sicredi, 6109178168 Bradesco). NULL = nota de antes disto,
--   que saía sempre no Bradesco.
-- - `orcamentos.boleto_status`: NULL = não pedido; 'pendente' = pedido junto
--   com a nota e ainda não gerado (os títulos podem demorar a aparecer);
--   'gerado' = todas as parcelas com boleto; 'erro' = o Omie recusou ou
--   faltou parcela (texto em `boleto_erro`).
-- - `orcamento_boletos`: uma linha por parcela (título do Omie), com o nosso
--   número que o Omie devolveu.
--
-- Aditiva e idempotente. ⚠️ O código lê estas colunas: rodar em PRODUÇÃO
-- ANTES do push (push na main = deploy).

ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS nota_conta_corrente BIGINT;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS boleto_status VARCHAR(20);
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS boleto_erro TEXT;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS boleto_atualizado_em TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS orcamento_boletos (
  omie_titulo   BIGINT PRIMARY KEY,                 -- codigo_lancamento_omie
  orcamento_id  INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  parcela       VARCHAR(20),                        -- numero_parcela ("001/003")
  vencimento    DATE,
  valor         NUMERIC(12,2),
  conta_corrente BIGINT,                            -- id_conta_corrente do título
  nosso_numero  VARCHAR(40),                        -- cNumBancario ("09/00000000866-7")
  gerado        BOOLEAN NOT NULL DEFAULT FALSE,
  erro          TEXT,
  gerado_em     TIMESTAMPTZ,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orcamento_boletos_orc ON orcamento_boletos(orcamento_id);
