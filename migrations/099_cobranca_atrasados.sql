-- 099 — Cobrança: os títulos em atraso que o sistema emitiu (23/11/2026).
-- Integração com o Omie, fase 3 (docs/modulos/omie-integracao.md).
--
-- ⚠️ SÓ O QUE O SISTEMA EMITIU (decisão do Pedro, 20/11 e de novo 23/11/2026).
-- O Omie tem 190 títulos "atrasados" (R$ 268,7 mil em 23/11/2026), muitos
-- já pagos e nunca baixados pela pessoa anterior. A cobrança acompanha só os
-- títulos que nasceram de uma nota emitida pelo sistema:
--   · orçamento avulso → `orcamentos.omie_os_codigo` (NFS-e) ou
--     `orcamentos.omie_pedido_codigo` (DANFE), casados pelo nCodOS/nCodPedido
--     do título;
--   · contrato faturado pelo lote → `omie_faturamento_itens.omie_os` /
--     `titulo_omie`.
--
-- - `omie_receber_atrasados`: cópia desses títulos vencidos e em aberto no
--   Omie (`ListarContasReceber` com `filtrar_por_status = ATRASADO`), trocada
--   inteira a cada volta do job de hora em hora. Título que foi baixado no
--   Omie (Sicredi pela API; Bradesco quando o retorno é importado lá) some
--   daqui sozinho.
-- - `omie_receber_pagos`: o "já pagou" marcado À MÃO no sistema (a baixa fica
--   só no sistema, decisão de 20/11/2026: nada é gravado no Omie). Some da
--   lista de cobrança enquanto o Omie não baixa; a sincronização nunca mexe
--   nesta tabela.
-- - `omie_clientes` ganha o telefone e o contato, para quem cobra ligar.
--
-- Aditiva e idempotente. ⚠️ O código lê estas tabelas e colunas: rodar em
-- PRODUÇÃO ANTES do push (push na main = deploy).

CREATE TABLE IF NOT EXISTS omie_receber_atrasados (
  omie_codigo     BIGINT PRIMARY KEY,         -- codigo_lancamento_omie
  omie_cliente    BIGINT,                     -- codigo_cliente_fornecedor
  -- de onde o título veio no sistema
  origem          VARCHAR(10) NOT NULL,       -- 'orcamento' | 'contrato'
  orcamento_id    INTEGER,                    -- sem FK: a cópia é refeita
  omie_contrato   BIGINT,                     -- omie_contratos.omie_codigo
  competencia     VARCHAR(7),                 -- 'AAAA-MM' do lote
  -- o título
  documento       VARCHAR(60),                -- numero_documento
  parcela         VARCHAR(20),                -- numero_parcela ("001/003")
  numero_nf       VARCHAR(30),                -- numero_documento_fiscal
  valor           NUMERIC(12,2) NOT NULL,     -- valor_documento
  emissao         DATE,
  vencimento      DATE NOT NULL,
  conta_corrente  BIGINT,                     -- id_conta_corrente
  boleto_numero   VARCHAR(40),                -- nosso número; NULL = sem boleto
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS omie_receber_atrasados_cliente_idx ON omie_receber_atrasados (omie_cliente);

-- O link do PDF do boleto sai de outra chamada (ObterBoleto), feita só quando
-- alguém pede. Fica guardado à parte porque a cópia acima é trocada inteira.
CREATE TABLE IF NOT EXISTS omie_boleto_links (
  omie_titulo     BIGINT PRIMARY KEY,
  link            TEXT NOT NULL,
  lido_em         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS omie_receber_pagos (
  omie_titulo     BIGINT PRIMARY KEY,         -- codigo_lancamento_omie
  pago_em         DATE NOT NULL,
  observacao      TEXT,
  marcado_por     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  marcado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE omie_clientes ADD COLUMN IF NOT EXISTS telefone  VARCHAR(30);
ALTER TABLE omie_clientes ADD COLUMN IF NOT EXISTS telefone2 VARCHAR(30);
ALTER TABLE omie_clientes ADD COLUMN IF NOT EXISTS contato   VARCHAR(120);
