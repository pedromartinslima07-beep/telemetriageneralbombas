-- 068 — orcamento_linhas.tipo_servico
--
-- Problema que isto resolve:
-- Nos orçamentos de serviço (limpeza de reservatório / dedetização / combo), a
-- linha guarda o VALOR do serviço e, no `ficha_tecnica`, a *especificação* que
-- o PDF injeta dentro da Cláusula Primeira.
--
-- Até aqui o PDF achava essa linha por REGEX na descrição:
--     /reservat[oó]rio/i.test(it.descricao)
-- (`acharEspecificacaoReservatorio` em src/services/orcamento-pdf.service.js).
--
-- Ou seja: bastava alguém editar a descrição para algo sem a palavra
-- "reservatório" — "Higienização da caixa d'água", por exemplo — e a
-- especificação sumia do PDF **em silêncio**, sem erro e sem aviso. O cliente
-- recebia o documento com a cláusula incompleta.
--
-- Com a chave explícita, o PDF acha a linha pelo que ela É, e a descrição volta
-- a ser texto livre de verdade. O regex continua no código como fallback para
-- as linhas já gravadas (que nascem com tipo_servico NULL).
--
-- Idempotente: pode rodar mais de uma vez.

ALTER TABLE orcamento_linhas
  ADD COLUMN IF NOT EXISTS tipo_servico TEXT;

-- Mesmos valores do CHECK de `orcamentos.tipo` (migration 060), menos 'pecas':
-- linha de peça não representa serviço nenhum e continua NULL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orcamento_linhas_tipo_servico_check'
  ) THEN
    ALTER TABLE orcamento_linhas
      ADD CONSTRAINT orcamento_linhas_tipo_servico_check
      CHECK (tipo_servico IS NULL OR tipo_servico IN ('limpeza_reservatorio', 'dedetizacao'));
  END IF;
END $$;

-- Backfill das linhas existentes, usando a mesma heurística que o PDF já usava.
-- Só toca linhas de orçamento cujo tipo é de serviço, para não marcar itens de
-- peça que por acaso mencionem "reservatório" na descrição.
UPDATE orcamento_linhas l
   SET tipo_servico = 'limpeza_reservatorio'
  FROM orcamentos o
 WHERE l.orcamento_id = o.id
   AND l.tipo_servico IS NULL
   AND o.tipo IN ('limpeza_reservatorio', 'limpeza_dedetizacao')
   AND l.descricao ~* 'reservat[oó]rio';

UPDATE orcamento_linhas l
   SET tipo_servico = 'dedetizacao'
  FROM orcamentos o
 WHERE l.orcamento_id = o.id
   AND l.tipo_servico IS NULL
   AND o.tipo IN ('dedetizacao', 'limpeza_dedetizacao')
   AND l.descricao ~* 'dedetiza|praga';

CREATE INDEX IF NOT EXISTS idx_orcamento_linhas_tipo_servico
  ON orcamento_linhas (orcamento_id, tipo_servico)
  WHERE tipo_servico IS NOT NULL;
