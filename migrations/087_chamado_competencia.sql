-- Migration 087 — O chamado de preventiva sabe de que mês ele é
--
-- O caso que expôs (02/10/2026): o Alex recebeu no app uma "Preventiva" do
-- AGUIA DE HAIA, criada em 28/09, de um prédio que tinha sido visitado no
-- próprio dia 28. O chamado #257 era o de OUTUBRO — aberto quando o Glebson
-- tocou "Iniciar" de novo logo depois de fechar setembro — e nada nele dizia
-- isso. O despacho de outubro adotou o chamado e o técnico leu "setembro".
--
-- ⚠️ A ESCALA JÁ ERA POR COMPETÊNCIA (082) E A BAIXA À MÃO TAMBÉM (085); O
-- CHAMADO ERA A PEÇA QUE NÃO ERA. Ele se ligava ao plano só por
-- `plano_manutencao_id`, e por isso o despacho e o "Iniciar" pegavam "o chamado
-- aberto do plano" — de qualquer mês. Medido em produção no mesmo dia: 42
-- chamados de setembro ainda abertos, e o job de 04/10 os teria herdado como
-- outubro sem criar nenhum.
--
-- ⚠️ NULO SÓ PARA O QUE NÃO É PREVENTIVA. Chamado comum não tem competência;
-- o CHECK é o mesmo dia 1 da 082 e da 085, pelo mesmo motivo.
--
-- O PREENCHIMENTO dos que já existem é o mês em que nasceram (no fuso de
-- Brasília — o banco roda em UTC), com uma exceção, que é exatamente o caso do
-- #257: se o mesmo plano já tinha aberto um chamado (não cancelado) naquele mês,
-- o segundo é do mês SEGUINTE. É o que o `executarPlano` fazia sem dizer:
-- a primeira abertura já tinha rolado `proxima_em` para o mês seguinte.
-- Conferido em produção antes de rodar: a exceção pega só o #257.
--
-- E o título dos chamados AINDA ABERTOS ganha o mês, que é o que o técnico lê
-- no app. Os fechados ficam como estão: o título deles já saiu em O.S. e PDF.
--
-- Idempotente: as colunas usam IF NOT EXISTS, o preenchimento só toca nulos, e
-- o título só ganha o mês quando ainda não tem o travessão.

BEGIN;

ALTER TABLE chamados
  ADD COLUMN IF NOT EXISTS competencia DATE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chamados_competencia_dia1') THEN
    ALTER TABLE chamados
      ADD CONSTRAINT chamados_competencia_dia1
      CHECK (competencia IS NULL OR EXTRACT(DAY FROM competencia) = 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chamados_plano_competencia
  ON chamados (plano_manutencao_id, competencia)
  WHERE plano_manutencao_id IS NOT NULL;

UPDATE chamados ch
   SET competencia = (
         date_trunc('month', ch.criado_em AT TIME ZONE 'America/Sao_Paulo')
         + CASE WHEN EXISTS (
             SELECT 1 FROM chamados o
              WHERE o.plano_manutencao_id = ch.plano_manutencao_id
                AND o.id < ch.id
                AND o.status <> 'cancelado'
                AND date_trunc('month', o.criado_em AT TIME ZONE 'America/Sao_Paulo')
                  = date_trunc('month', ch.criado_em AT TIME ZONE 'America/Sao_Paulo')
           ) AND ch.status <> 'cancelado'
           THEN INTERVAL '1 month' ELSE INTERVAL '0' END
       )::date
 WHERE ch.plano_manutencao_id IS NOT NULL
   AND ch.competencia IS NULL;

UPDATE chamados
   SET titulo = titulo || ' — '
       || (ARRAY['janeiro','fevereiro','março','abril','maio','junho','julho',
                 'agosto','setembro','outubro','novembro','dezembro'])[EXTRACT(MONTH FROM competencia)::int]
       || '/' || to_char(competencia, 'YY')
 WHERE plano_manutencao_id IS NOT NULL
   AND competencia IS NOT NULL
   AND status NOT IN ('fechado', 'cancelado')
   AND titulo NOT LIKE '% — %';

COMMIT;
