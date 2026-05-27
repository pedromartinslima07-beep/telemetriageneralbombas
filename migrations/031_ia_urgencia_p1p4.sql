-- Migration 031 — Migra mensagens_whatsapp.ia_urgencia para o enum p1-p4
--
-- A coluna foi criada na migration 001 com CHECK ('baixa','media','alta','emergencia'),
-- de quando a IA classificava urgência nesse vocabulário. A Fase 11 padronizou tudo
-- em p1-p4 (P1 crítico, P2 alta, P3 controlado, P4 agendado) mas ia_urgencia ficou
-- pra trás. Esta migration alinha.
--
-- Mapeamento: emergencia→p1, alta→p2, media→p3, baixa→p4.

BEGIN;

-- 1) Dropa o CHECK antigo
ALTER TABLE mensagens_whatsapp DROP CONSTRAINT IF EXISTS mensagens_whatsapp_ia_urgencia_check;

-- 2) Backfill dos valores legados (defensivo — em produção todos eram NULL)
UPDATE mensagens_whatsapp
SET ia_urgencia = CASE ia_urgencia
  WHEN 'emergencia' THEN 'p1'
  WHEN 'alta'       THEN 'p2'
  WHEN 'media'      THEN 'p3'
  WHEN 'baixa'      THEN 'p4'
  ELSE ia_urgencia
END
WHERE ia_urgencia IN ('emergencia', 'alta', 'media', 'baixa');

-- 3) Recria o CHECK com o vocabulário novo
ALTER TABLE mensagens_whatsapp
  ADD CONSTRAINT mensagens_whatsapp_ia_urgencia_check
  CHECK (ia_urgencia IS NULL OR ia_urgencia IN ('p1', 'p2', 'p3', 'p4'));

COMMIT;
