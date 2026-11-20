-- 095 — Notas e avisos do prédio (20/11/2026). Redesenho, etapa 8: a página
-- do condomínio em três colunas (docs/modulos/redesenho-admin.md).
--
-- Duas coisas que a maquete pedia e o banco não tinha onde guardar:
--
-- - tipo 'nota': a NOTA LIVRE do histórico do prédio ("síndico pediu para
--   ligar antes", "chave da casa de bombas com o zelador"). Escrita pelo
--   escritório (admin, gerente, operador); só o autor ou a gestão apagam.
-- - tipo 'aviso': o AVISO AOS SÍNDICOS mandado em lote pela lista de
--   Condomínios. Uma linha por prédio que recebeu, com o assunto e para quem
--   foi (o e-mail do cadastro, o mesmo destino da O.S.). Fica no histórico do
--   prédio: "o que a gente já disse a este síndico".
--
-- Aditiva e idempotente. ⚠️ O código da página e da lista lê esta tabela:
-- rodar em PRODUÇÃO ANTES do push (push na main = deploy), depois de 090 a 094.

CREATE TABLE IF NOT EXISTS condominio_notas (
  id             SERIAL PRIMARY KEY,
  condominio_id  INTEGER NOT NULL REFERENCES condominios(id) ON DELETE CASCADE,
  tipo           VARCHAR(10) NOT NULL DEFAULT 'nota',
  texto          TEXT NOT NULL,
  assunto        VARCHAR(200),
  enviado_para   TEXT,
  autor_id       INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'condominio_notas_tipo_check') THEN
    ALTER TABLE condominio_notas
      ADD CONSTRAINT condominio_notas_tipo_check CHECK (tipo IN ('nota', 'aviso'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS condominio_notas_condo_idx
  ON condominio_notas (condominio_id, criado_em DESC);
