-- 107 — Regra pelo emissor nas guias (24/11/2026).
-- docs/modulos/guias-tributos.md
--
-- A tela de Guias (migration 100) põe fornecedor, categoria e conta do Omie
-- pela REGRA DO TIPO (DAS, DARF, FGTS...). Para conta que não é tributo
-- (boleto de fornecedor, água, luz, telefone) todas caíam em "outro", uma
-- regra só: a Vivo e a Sabesp dividiam fornecedor. Agora o leitor tira do PDF
-- QUEM COBRA (guia-leitura.service.js, emissorDe) e a regra é por emissor.
--
-- - `guias_tributos.emissor_chave`: 'cnpj:<14>' | 'arr:<segmento>:<empresa>'
--   | 'bol:<banco>:<agência>-<conta>'. NULL nos tributos (vale o tipo) e no
--   boleto sem nada que identifique quem cobra.
-- - `guias_emissores`: para cada emissor, o fornecedor, a categoria e a conta
--   do Omie. Nasce vazia: grava pelo "Usar sempre para este emissor" da tela.
--
-- Aditiva e idempotente. ⚠️ O código lê estas colunas: rodar em PRODUÇÃO
-- ANTES do push (push na main = deploy).

ALTER TABLE guias_tributos ADD COLUMN IF NOT EXISTS emissor_chave VARCHAR(60);
CREATE INDEX IF NOT EXISTS guias_tributos_emissor_idx ON guias_tributos (emissor_chave) WHERE emissor_chave IS NOT NULL;

CREATE TABLE IF NOT EXISTS guias_emissores (
  chave            VARCHAR(60) PRIMARY KEY,
  nome             VARCHAR(120),                          -- o que o PDF dizia (só para mostrar)
  omie_fornecedor  BIGINT,
  omie_categoria   VARCHAR(20),
  omie_conta       BIGINT,
  atualizado_por   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
