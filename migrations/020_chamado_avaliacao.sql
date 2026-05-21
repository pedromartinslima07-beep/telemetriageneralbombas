-- Avaliação do atendimento pelo cliente, disponível após o chamado fechar
-- (ou a O.S. ser finalizada). nota 1-5 (estrelas); comentário opcional.
-- Uma única avaliação por chamado.

ALTER TABLE chamados
  ADD COLUMN IF NOT EXISTS avaliacao_nota         SMALLINT
    CHECK (avaliacao_nota IS NULL OR avaliacao_nota BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS avaliacao_comentario   TEXT,
  ADD COLUMN IF NOT EXISTS avaliacao_em           TIMESTAMPTZ;
