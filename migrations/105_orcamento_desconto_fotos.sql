-- 105 — Orçamento: desconto visível e fotos (23/11/2026).
-- docs/modulos/orcamento-documento.md
--
-- Pedido do Pedro, depois da comparação com Omie, Bling, Jobber, ServiceTitan
-- e Housecall Pro: "faz os 6, 7 e 8" — fotos no orçamento, desconto que o
-- cliente vê, e o orçamento como documento (o 8 é só tela, sem coluna).
--
-- 1. DESCONTO. `desconto_tipo` ('valor' | 'percentual') e `desconto_valor`
--    (R$ ou %). NULL = sem desconto.
--
--    ⚠️ O TOTAL CONTINUA MORANDO EM `orcamentos.valor`. Lista, PDF, painel do
--    cliente, e-mail, relatórios e nota fiscal leem COALESCE(o.valor, soma dos
--    itens) em oito lugares; com desconto, `valor` passa a ser a soma MENOS o
--    desconto, calculada aqui no banco. Nenhum desses leitores precisou mudar.
--    Quem distingue "total manual" de "total com desconto" é desconto_tipo:
--    com desconto o PDF mostra o preço de cada item (o manual esconde) e as
--    linhas Subtotal / Desconto / Total.
--
--    O recálculo é um GATILHO em orcamento_linhas: item novo, valor mudado ou
--    item removido refazem o total na hora, venha de qual rota vier (editor,
--    "trazer peças da O.S.", padrão de limpeza, bancada). A rota do orçamento
--    chama a mesma função depois de gravar o desconto.
--
-- 2. FOTOS. `orcamento_fotos`: a foto que vai no orçamento (PDF e painel do
--    cliente). Ou aponta para uma foto da O.S. (`os_foto_id`, sem copiar o
--    arquivo) ou guarda a própria (`dados_base64`, já reduzida no navegador —
--    ver CLAUDE.md sobre imagem grande). `chave` é o endereço público da
--    imagem (o <img> não manda token), aleatório para não dar para varrer.
--
-- Aditiva e idempotente. ⚠️ O código lê estas colunas: rodar em PRODUÇÃO
-- antes do push (o push na main é o deploy).

ALTER TABLE orcamentos
  ADD COLUMN IF NOT EXISTS desconto_tipo  VARCHAR(10),
  ADD COLUMN IF NOT EXISTS desconto_valor NUMERIC(12,2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentos_desconto_tipo_chk') THEN
    ALTER TABLE orcamentos ADD CONSTRAINT orcamentos_desconto_tipo_chk
      CHECK (desconto_tipo IS NULL OR desconto_tipo IN ('valor', 'percentual'));
  END IF;
END $$;

-- Refaz o total de UM orçamento com desconto. Sem desconto não toca em nada
-- (o total manual, se houver, continua sendo do operador).
CREATE OR REPLACE FUNCTION fn_orcamento_aplicar_desconto(p_orc INTEGER) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_tipo  VARCHAR(10);
  v_desc  NUMERIC(12,2);
  v_soma  NUMERIC(14,2);
BEGIN
  SELECT desconto_tipo, desconto_valor INTO v_tipo, v_desc FROM orcamentos WHERE id = p_orc;
  IF v_tipo IS NULL THEN RETURN; END IF;
  SELECT COALESCE(SUM(quantidade * COALESCE(valor_unitario, 0)), 0) INTO v_soma
    FROM orcamento_linhas WHERE orcamento_id = p_orc;
  UPDATE orcamentos
     SET valor = GREATEST(0, ROUND(v_soma - CASE WHEN v_tipo = 'percentual'
                                                 THEN v_soma * COALESCE(v_desc, 0) / 100
                                                 ELSE COALESCE(v_desc, 0) END, 2))
   WHERE id = p_orc;
END $$;

CREATE OR REPLACE FUNCTION fn_orcamento_linhas_desconto() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM fn_orcamento_aplicar_desconto(OLD.orcamento_id);
    RETURN OLD;
  END IF;
  PERFORM fn_orcamento_aplicar_desconto(NEW.orcamento_id);
  IF TG_OP = 'UPDATE' AND OLD.orcamento_id IS DISTINCT FROM NEW.orcamento_id THEN
    PERFORM fn_orcamento_aplicar_desconto(OLD.orcamento_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_orcamento_linhas_desconto ON orcamento_linhas;
CREATE TRIGGER trg_orcamento_linhas_desconto
  AFTER INSERT OR UPDATE OF quantidade, valor_unitario, orcamento_id OR DELETE ON orcamento_linhas
  FOR EACH ROW EXECUTE FUNCTION fn_orcamento_linhas_desconto();

CREATE TABLE IF NOT EXISTS orcamento_fotos (
  id            SERIAL PRIMARY KEY,
  orcamento_id  INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  os_foto_id    INTEGER REFERENCES os_fotos(id) ON DELETE CASCADE,
  dados_base64  TEXT,
  legenda       VARCHAR(255),
  ordem         INTEGER NOT NULL DEFAULT 0,
  chave         TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  criado_por    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT orcamento_fotos_origem_chk CHECK (os_foto_id IS NOT NULL OR dados_base64 IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_orcamento_fotos_orc ON orcamento_fotos(orcamento_id, ordem, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orcamento_fotos_chave ON orcamento_fotos(chave);
-- A mesma foto da O.S. entra uma vez só no mesmo orçamento.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orcamento_fotos_os_foto
  ON orcamento_fotos(orcamento_id, os_foto_id) WHERE os_foto_id IS NOT NULL;
