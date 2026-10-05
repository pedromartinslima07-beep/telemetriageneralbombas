-- Migration 088 — Pedir nova assinatura de uma O.S. já finalizada
--
-- O caso (05/10/2026): a OS-2026-0139 (Smart Home Cambuci) foi finalizada com
-- a assinatura EM BRANCO — um PNG transparente que passava no
-- `assinatura_b64 IS NOT NULL` do /finalizar. A 0069 gravou um ponto e a 0052
-- um risco solto. A original não existe mais em lugar nenhum: o app gravou o
-- quadro vazio POR CIMA dela.
--
-- O técnico não podia corrigir — O.S. finalizada é só leitura para ele, e isso
-- fica. O que nasce aqui é uma porta estreita: o escritório PEDE a nova
-- assinatura de uma O.S. específica, e só então o técnico dono consegue colher
-- e gravar a assinatura (e o nome de quem recebeu) naquela O.S. fechada.
--
--   assinatura_refazer_em  quando o escritório pediu. NULL = nada pendente.
--                          É o que acende o botão no app do técnico.
--   assinatura_refeita_em  quando a nova assinatura chegou. Fica para sempre:
--                          a assinatura dessa O.S. NÃO foi colhida na hora do
--                          serviço, e o PDF diz isso em vez de esconder.
--
-- Idempotente.

ALTER TABLE ordens_servico
  ADD COLUMN IF NOT EXISTS assinatura_refazer_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assinatura_refeita_em TIMESTAMPTZ;
