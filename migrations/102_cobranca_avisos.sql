-- 102 — O e-mail da nota pelo Omie e os avisos de cobrança (23/11/2026).
-- docs/modulos/cobranca-avisos.md
--
-- Duas coisas que andam juntas porque usam a MESMA lista de e-mails:
--
-- 1. A nota emitida pelo sistema não pedia ao Omie para mandar e-mail (as
--    O.S. feitas na tela do Omie levam o bloco Email: enviar boleto, enviar
--    link e "cEnviarPara"). Agora a emissão manda o bloco, com os
--    destinatários que o Omie usou na última O.S./pedido do cliente
--    (conferidos no modal). Lido em 23/11/2026: das 300 O.S. mais recentes,
--    todas têm destinatário, e ele NUNCA é o e-mail do cadastro do cliente.
--    - `omie_cliente_emails`: os destinatários do cliente lidos do Omie
--      (guardados: o Omie recusa a mesma consulta em < 60 s).
--    - `orcamentos.nota_emails`: os que foram na emissão.
--
-- 2. Os avisos de cobrança por e-mail (3 dias antes, no dia, 3 e 10 dias de
--    atraso, dias nas Configurações), SÓ dos títulos que o sistema emitiu.
--    - `omie_receber_avencer`: cópia dos títulos do sistema "A VENCER" e
--      "VENCE HOJE" no Omie (a dos atrasados é a 099), trocada inteira a
--      cada volta da sincronização de hora em hora.
--    - `cobranca_avisos`: a fila e o histórico. Uma linha por (título,
--      etapa, vencimento): o mesmo aviso nunca vai duas vezes.
--      status: pendente → enviando → enviado | erro; sem_email; expirado
--      (o título foi pago ou a etapa passou antes de alguém aprovar);
--      ignorado (alguém tirou da fila).
--
-- Aditiva e idempotente. ⚠️ O código lê estas tabelas: rodar em PRODUÇÃO
-- ANTES do push (push na main = deploy).

ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS nota_emails TEXT;

CREATE TABLE IF NOT EXISTS omie_cliente_emails (
  omie_cliente   BIGINT PRIMARY KEY,
  emails         TEXT,                       -- separados por vírgula; NULL = o Omie não tem
  fonte          VARCHAR(10),                -- 'os' | 'pedido' | 'cadastro' | NULL
  referencia     BIGINT,                     -- nCodOS / codigo_pedido de onde veio
  lido_em        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- O número e a data da nota de onde a lista veio: o modal mostra "da O.S. 104
-- de 25/09/2023", e lista velha fica à vista. Em 2026 o padrão é o cliente +
-- uma cópia para a General (158 de 187 O.S. de contrato de set–nov).
ALTER TABLE omie_cliente_emails ADD COLUMN IF NOT EXISTS referencia_numero VARCHAR(20);
ALTER TABLE omie_cliente_emails ADD COLUMN IF NOT EXISTS referencia_data DATE;

CREATE TABLE IF NOT EXISTS omie_receber_avencer (
  omie_codigo     BIGINT PRIMARY KEY,         -- codigo_lancamento_omie
  omie_cliente    BIGINT,
  origem          VARCHAR(10) NOT NULL,       -- 'orcamento' | 'contrato'
  orcamento_id    INTEGER,
  omie_contrato   BIGINT,
  competencia     VARCHAR(7),
  documento       VARCHAR(60),
  parcela         VARCHAR(20),
  numero_nf       VARCHAR(30),
  valor           NUMERIC(12,2) NOT NULL,
  emissao         DATE,
  vencimento      DATE NOT NULL,
  vence_hoje      BOOLEAN NOT NULL DEFAULT FALSE, -- o Omie diz "VENCE HOJE" (inclui o que venceu no fim de semana)
  conta_corrente  BIGINT,
  boleto_numero   VARCHAR(40),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cobranca_avisos (
  id              SERIAL PRIMARY KEY,
  omie_titulo     BIGINT NOT NULL,
  etapa           VARCHAR(10) NOT NULL,       -- 'antes' | 'dia' | 'atraso1' | 'atraso2'
  vencimento      DATE NOT NULL,
  dias            INTEGER,                    -- dias até o vencimento (negativo = atraso) quando entrou na fila
  omie_cliente    BIGINT,
  origem          VARCHAR(10),
  orcamento_id    INTEGER,
  valor           NUMERIC(12,2),
  numero_nf       VARCHAR(30),
  destinatarios   TEXT,
  status          VARCHAR(12) NOT NULL DEFAULT 'pendente',
  erro            TEXT,
  email_id        VARCHAR(80),                -- id do Resend
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enviado_em      TIMESTAMPTZ,
  enviado_por     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL, -- NULL no envio automático
  automatico      BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (omie_titulo, etapa, vencimento)
);
CREATE INDEX IF NOT EXISTS cobranca_avisos_status_idx ON cobranca_avisos (status, criado_em);
CREATE INDEX IF NOT EXISTS cobranca_avisos_titulo_idx ON cobranca_avisos (omie_titulo);
