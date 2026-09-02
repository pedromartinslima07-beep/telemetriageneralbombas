-- Migration 083 — `ttr_min` passa a valer o prazo do CONTRATO
--
-- A cláusula 7 da minuta fixa UM número por prioridade: o de comparecimento
-- (`sla_chegada_min`). Prazo de resolução ela não fixa — 7.1.a: "o SLA é prazo
-- de resposta operacional, mobilização e comparecimento técnico, e NÃO
-- garantia de solução definitiva no mesmo prazo".
--
-- `ttr_min` era, portanto, um prazo INVENTADO: número interno que ninguém
-- derivou de lugar nenhum e que o painel cobrava como se fosse contratual (o
-- selo "⏱ TTR estourado" eleva o chamado a alerta crítico). Igualá-lo à
-- chegada é a única forma de o painel não exigir mais do que o contrato.
--
-- ⚠️ ISTO CONSERTA UMA INVERSÃO QUE A 082 CRIOU. Ao corrigir o P2 de 24h para
-- as 48h do contrato, o `ttr_min` de P2 ficou em 1440 (24h) — MENOR que o
-- prazo de chegada. Um P2 aberto há 24h01 era marcado como atrasado enquanto o
-- contrato ainda dava um dia inteiro para o técnico sequer chegar.
--
-- ⚠️ P1 FICA MAIS ESTRITO DE PROPÓSITO: 240 (4h) → 180 (3h). As 4h não vinham
-- do contrato; as 3h vêm.
--
-- ⚠️ P4 NÃO MUDA. O contrato diz "agendamento", ou seja, prazo nenhum:
-- `sla_chegada_min` é NULL e `ttr_min` é NOT NULL CHECK > 0, então não há o
-- que copiar. Fica nos 19400 min que já estavam lá — número interno, e o
-- único que continua sendo.

BEGIN;

UPDATE sla_definicoes
   SET ttr_min = sla_chegada_min
 WHERE sla_chegada_min IS NOT NULL
   AND ttr_min IS DISTINCT FROM sla_chegada_min;

-- Prova de que nenhuma linha ficou com o prazo de resolver menor que o de
-- chegar. Se isto disparar, a UPDATE acima não cobriu algum caso.
DO $$
DECLARE n INTEGER;
BEGIN
  SELECT COUNT(*) INTO n FROM sla_definicoes
   WHERE sla_chegada_min IS NOT NULL AND ttr_min < sla_chegada_min;
  IF n > 0 THEN
    RAISE EXCEPTION 'ainda existem % linha(s) com ttr_min < sla_chegada_min', n;
  END IF;
  RAISE NOTICE 'ttr_min alinhado ao contrato em todas as prioridades com prazo';
END $$;

COMMIT;
