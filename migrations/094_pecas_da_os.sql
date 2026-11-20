-- 094 — Peças da O.S.: usadas e a orçar, e a origem na linha do orçamento
-- (20/11/2026). Peças no orçamento, fase B: docs/modulos/pecas-no-orcamento.md
--
-- O técnico registra em os_pecas tanto a peça que USOU na visita quanto a que
-- FALTA e precisa de orçamento (resposta do Pedro, 20/11/2026), e as duas são
-- cobradas por orçamento — o que muda é o bloco no PDF ("utilizadas na
-- visita" × "a instalar"). Até aqui nada separava uma da outra.
--
-- - os_pecas.situacao: 'usada' | 'a_orcar'. NULL = não se sabe (as antigas
--   ficam assim; ninguém adivinha pelo texto, quem marca é uma pessoa).
-- - orcamento_linhas.os_peca_id: de qual peça da O.S. a linha veio. É a trava
--   contra cobrar a mesma peça duas vezes (a rota recusa trazer peça que já
--   está num orçamento não recusado). SET NULL: apagar a peça não apaga a
--   linha já orçada.
-- - orcamento_linhas.peca_usada: a linha é de peça usada na visita. Copiada
--   da peça ao trazer e editável; é ela que o PDF lê para separar os blocos,
--   porque a linha também pode ser escrita à mão.
--
-- Aditiva e idempotente. ⚠️ O código das rotas de linha e da O.S. lê estas
-- colunas: rodar em PRODUÇÃO ANTES do push (push na main = deploy), depois
-- de 090 a 093.

ALTER TABLE os_pecas
  ADD COLUMN IF NOT EXISTS situacao VARCHAR(10);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'os_pecas_situacao_check') THEN
    ALTER TABLE os_pecas
      ADD CONSTRAINT os_pecas_situacao_check
      CHECK (situacao IS NULL OR situacao IN ('usada', 'a_orcar'));
  END IF;
END $$;

ALTER TABLE orcamento_linhas
  ADD COLUMN IF NOT EXISTS os_peca_id INTEGER REFERENCES os_pecas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS peca_usada BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS orcamento_linhas_os_peca_idx
  ON orcamento_linhas (os_peca_id) WHERE os_peca_id IS NOT NULL;
