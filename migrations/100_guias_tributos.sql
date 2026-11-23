-- 100 — Guias de tributos viram contas a pagar no Omie (23/11/2026).
-- docs/modulos/guias-tributos.md
--
-- Hoje o escritório baixa as guias (DAS, DARF, FGTS, DAE, parcelamento...)
-- do Onvio do contador e digita cada uma no contas a pagar do Omie. Agora o
-- PDF entra no sistema, o sistema lê tipo, valor, vencimento e código de
-- barras, alguém confere, e "Lançar no Omie" cria a conta a pagar
-- (financas/contapagar IncluirContaPagar) com o PDF anexado.
--
-- - `guias_tributos`: uma linha por guia lida. O PDF fica aqui (bytea; uma
--   guia tem dezenas de KB). Um PDF com duas guias vira duas linhas com o
--   mesmo `arquivo_md5`. O código de barras é único entre as guias vivas:
--   subir a mesma guia duas vezes não cria uma segunda conta a pagar.
--   `status`: conferir → enviando → lancada | erro | incerto; descartada.
--   `incerto` = o Omie não respondeu: antes de mandar de novo o sistema
--   pergunta ao Omie pelo código de integração (GB-GUIA-<id>), e nunca cria
--   duas.
-- - `guias_regras`: para cada tipo de guia, o fornecedor, a categoria e a
--   conta que o Omie usa. Semeada com o que o próprio Omie mostrou em
--   23/11/2026 (leitura dos contas a pagar de set–nov/2026): Receita Federal
--   (5993951792) e a conta BRADESCO * (6109178168) em todas; DAS em
--   2.06.99, FGTS em 2.03.07, parcelamento em 2.06.98, TFE/TFA em 2.06.97,
--   INSS (DAE/GPS) em 2.03.06. Mudam na tela, sem deploy.
--
-- Aditiva e idempotente. ⚠️ O código lê estas tabelas: rodar em PRODUÇÃO
-- ANTES do push (push na main = deploy).

CREATE TABLE IF NOT EXISTS guias_tributos (
  id               SERIAL PRIMARY KEY,
  tipo             VARCHAR(14) NOT NULL DEFAULT 'outro',  -- das | darf | fgts | dae | gps | parcelamento | municipal | outro
  descricao        VARCHAR(120),
  competencia      VARCHAR(7),                            -- 'AAAA-MM' (período de apuração)
  vencimento       DATE,
  valor            NUMERIC(12,2),
  linha_digitavel  VARCHAR(60),                           -- só dígitos (47 boleto, 48 arrecadação)
  codigo_barras    VARCHAR(44),                           -- os 44 do código de barras
  numero_documento VARCHAR(40),
  cnpj             VARCHAR(14),                           -- contribuinte que o PDF diz, só dígitos
  leitura          JSONB NOT NULL DEFAULT '{}'::jsonb,    -- o que o leitor achou + avisos
  arquivo_nome     VARCHAR(200),
  arquivo          BYTEA,
  arquivo_md5      VARCHAR(32),
  -- o destino no Omie
  omie_fornecedor  BIGINT,
  omie_categoria   VARCHAR(20),
  omie_conta       BIGINT,
  status           VARCHAR(12) NOT NULL DEFAULT 'conferir',
  omie_codigo      BIGINT,                                -- codigo_lancamento_omie da conta a pagar
  omie_erro        TEXT,
  anexo_ok         BOOLEAN NOT NULL DEFAULT FALSE,
  anexo_erro       TEXT,
  enviado_em       TIMESTAMPTZ,
  enviado_por      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_por       INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS guias_tributos_barras_uq
  ON guias_tributos (codigo_barras) WHERE codigo_barras IS NOT NULL AND status <> 'descartada';
CREATE INDEX IF NOT EXISTS guias_tributos_status_idx ON guias_tributos (status, vencimento);

CREATE TABLE IF NOT EXISTS guias_regras (
  tipo             VARCHAR(14) PRIMARY KEY,
  omie_fornecedor  BIGINT,
  omie_categoria   VARCHAR(20),
  omie_conta       BIGINT,
  atualizado_por   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO guias_regras (tipo, omie_fornecedor, omie_categoria, omie_conta) VALUES
  ('das',          5993951792, '2.06.99', 6109178168),
  ('darf',         5993951792, NULL,      6109178168),
  ('fgts',         5993951792, '2.03.07', 6109178168),
  ('dae',          5993951792, '2.03.06', 6109178168),
  ('gps',          5993951792, '2.03.06', 6109178168),
  ('parcelamento', 5993951792, '2.06.98', 6109178168),
  ('municipal',    5993972859, '2.06.97', 6109178168),
  ('outro',        NULL,       NULL,      6109178168)
ON CONFLICT (tipo) DO NOTHING;
