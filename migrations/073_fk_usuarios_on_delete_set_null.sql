-- Migration 073 — Remover usuário deixa de estourar erro 500
--
-- Sintoma: DELETE /admin/usuarios/:id respondia "Erro ao remover usuário"
-- (500) para qualquer usuário que já tivesse criado/aprovado alguma coisa.
--
-- Causa: várias colunas de autoria apontam para `usuarios(id)` sem cláusula
-- `ON DELETE` — o padrão do Postgres é NO ACTION, que **bloqueia** o DELETE
-- com erro 23503. As FKs afetadas nasceram nas migrations 023 (sla_definicoes),
-- 026 e 030 (orcamentos), 032 (planos_manutencao) e 035 (contratos). As demais
-- referências a usuários já usavam CASCADE (login_codes, trusted_devices) ou
-- SET NULL (histórico, conversas, equipamentos) e nunca travaram nada.
--
-- Correção: converter toda FK → usuarios que ainda esteja em NO ACTION/RESTRICT
-- para ON DELETE SET NULL. Semântica desejada: o orçamento/contrato/plano
-- continua existindo, só perde o autor. O bloco varre o catálogo em vez de
-- listar nomes fixos porque nem toda coluna do histórico sobreviveu (a 024 criou
-- ordens_servico.orcamento_aprovado_por e a 030 dropou) e os nomes de constraint
-- gerados pelo Postgres podem divergir entre bancos.
--
-- Idempotente: rodar de novo não encontra nada em NO ACTION e não faz nada.

DO $$
DECLARE
  r    RECORD;
  cols TEXT;
BEGIN
  FOR r IN
    SELECT c.conname, src.relname AS tabela, src.oid AS relid, c.conkey
      FROM pg_constraint c
      JOIN pg_class     src ON src.oid = c.conrelid
      JOIN pg_class     tgt ON tgt.oid = c.confrelid
      JOIN pg_namespace ns  ON ns.oid  = src.relnamespace
     WHERE c.contype     = 'f'
       AND tgt.relname   = 'usuarios'
       AND ns.nspname    = 'public'
       AND c.confdeltype IN ('a', 'r')   -- NO ACTION | RESTRICT
  LOOP
    -- SET NULL é impossível em coluna NOT NULL: deixa como está e avisa.
    IF EXISTS (
      SELECT 1 FROM pg_attribute a
       WHERE a.attrelid = r.relid AND a.attnum = ANY(r.conkey) AND a.attnotnull
    ) THEN
      RAISE NOTICE 'FK % (%): coluna NOT NULL, mantida como está', r.conname, r.tabela;
      CONTINUE;
    END IF;

    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord)
      INTO cols
      FROM unnest(r.conkey) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = r.relid AND a.attnum = k.attnum;

    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', 'public', r.tabela, r.conname);
    EXECUTE format(
      'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%s) '
      || 'REFERENCES %I.usuarios(id) ON DELETE SET NULL',
      'public', r.tabela, r.conname, cols, 'public'
    );
    RAISE NOTICE 'FK % (%.%) → ON DELETE SET NULL', r.conname, r.tabela, cols;
  END LOOP;
END $$;

-- Conferência (rode manualmente se quiser ver o resultado — o migrate.js não
-- imprime NOTICE):
--   SELECT src.relname, c.conname, c.confdeltype
--     FROM pg_constraint c
--     JOIN pg_class src ON src.oid = c.conrelid
--     JOIN pg_class tgt ON tgt.oid = c.confrelid
--    WHERE c.contype = 'f' AND tgt.relname = 'usuarios'
--    ORDER BY c.confdeltype, src.relname;
-- confdeltype: n = SET NULL · c = CASCADE · a = NO ACTION (bloqueia)
