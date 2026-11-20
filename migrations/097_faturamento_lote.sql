-- 097 — o lote do faturamento dos contratos (integração com o Omie, fase 2).
--
-- O sistema prepara o lote do mês; o Pedro confere, tira quem quiser e
-- confirma. Só então cada contrato é faturado no Omie (FaturarContrato). Ver
-- docs/modulos/omie-integracao.md.
--
-- ⚠️ UMA LINHA POR (competência, contrato) — é o que impede o sistema de
-- faturar o mesmo contrato duas vezes no mês. A linha nasce quando o Pedro
-- tira o contrato do lote ou quando o envio começa; quem só "entra" no lote
-- não tem linha.

CREATE TABLE IF NOT EXISTS omie_faturamento_itens (
  id               SERIAL PRIMARY KEY,
  competencia      VARCHAR(7)  NOT NULL,           -- 'AAAA-MM'
  omie_contrato    BIGINT      NOT NULL,           -- omie_contratos.omie_codigo (sem FK: a cópia é refeita)
  -- tirado   = o Pedro tirou do lote (não vai ao Omie)
  -- enviando = FaturarContrato chamado, sem resposta ainda
  -- faturado = o Omie respondeu cCodStatus "0" e devolveu a OS
  -- erro     = o Omie recusou (não faturou); pode ir de novo
  -- incerto  = a chamada caiu sem resposta (rede/tempo): NÃO vai de novo
  --            sozinho; a sincronização resolve quando a nota aparecer
  status           VARCHAR(10) NOT NULL,
  valor            NUMERIC(12,2),
  conta_corrente   BIGINT,
  omie_os          BIGINT,                         -- nCodOS devolvido pelo FaturarContrato
  omie_status      VARCHAR(40),                    -- cCodStatus, o faultcode ou NAO-PENDENTE
  omie_mensagem    TEXT,                           -- cDescStatus ou a falha
  nfse_numero      VARCHAR(30),
  titulo_omie      BIGINT,                         -- codigo_lancamento_omie da conta a receber
  titulo_vencimento DATE,
  titulo_valor     NUMERIC(12,2),
  titulo_status    VARCHAR(20),                    -- status_titulo do Omie (A VENCER, RECEBIDO…)
  boleto_numero    VARCHAR(30),                    -- boleto.cNumBoleto
  boleto_bancario  VARCHAR(30),                    -- boleto.cNumBancario (o "nosso número")
  por_usuario      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  enviado_em       TIMESTAMPTZ,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (competencia, omie_contrato)
);

CREATE INDEX IF NOT EXISTS idx_omie_fat_itens_status ON omie_faturamento_itens (status);

-- A conta corrente em que o contrato cobra (infAdic.nCodCC): o lote só leva
-- Sicredi e Bradesco.
ALTER TABLE omie_contratos ADD COLUMN IF NOT EXISTS conta_corrente BIGINT;

-- A OS de onde a nota saiu: é por ela que a nota volta ao item do lote.
ALTER TABLE omie_contrato_notas ADD COLUMN IF NOT EXISTS omie_os BIGINT;
CREATE INDEX IF NOT EXISTS idx_omie_contrato_notas_os ON omie_contrato_notas (omie_os);

-- (o faultcode do Omie passa de 10 caracteres: "SOAP-ENV:Client-5")
ALTER TABLE omie_faturamento_itens ALTER COLUMN omie_status TYPE VARCHAR(40);

-- O boleto do título (20/11/2026): o Omie gera junto com a nota quando o
-- contrato manda boleto; quando não gera, o painel avisa e o Pedro pede.
--   boleto_gerado    = boleto.cGerado do título ("S")
--   boleto_pedido_em = quando o sistema pediu o GerarBoleto (trava contra
--                      pedido em dobro enquanto o Omie não responde)
ALTER TABLE omie_faturamento_itens ADD COLUMN IF NOT EXISTS boleto_gerado BOOLEAN;
ALTER TABLE omie_faturamento_itens ADD COLUMN IF NOT EXISTS boleto_pedido_em TIMESTAMPTZ;
