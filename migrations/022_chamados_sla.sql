-- Migration 022 — Métricas de SLA por chamado (Fase 8A)
-- Adiciona 2 colunas pra cálculo de TTFR e TTR:
--   primeira_resposta_em — quando alguém da equipe interagiu com o chamado
--                          pela primeira vez (status mudou, técnico mandou
--                          mensagem, admin comentou). Preenchida via
--                          COALESCE(primeira_resposta_em, NOW()) nos hooks
--                          — a primeira escrita ganha.
--   tempo_resolucao_seg  — segundos entre criado_em e fechamento. Calculado
--                          quando status muda pra 'fechado'. Reabertura zera
--                          (vira NULL) e o próximo fechamento recalcula.

ALTER TABLE chamados
  ADD COLUMN IF NOT EXISTS primeira_resposta_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tempo_resolucao_seg  INTEGER;

-- Backfill conservador: pra chamados já fechados, calcula tempo_resolucao_seg
-- a partir de fechado_em (existente). Sem isso, KPIs dos primeiros dias após
-- deploy ignorariam todo o histórico.
UPDATE chamados
   SET tempo_resolucao_seg = GREATEST(0, EXTRACT(EPOCH FROM (fechado_em - criado_em))::int)
 WHERE status = 'fechado'
   AND fechado_em IS NOT NULL
   AND tempo_resolucao_seg IS NULL;

-- Index parcial pros relatórios de SLA (group by + filtro temporal).
-- Cobre as queries do GET /relatorios/sla-metricas — filtra por criado_em
-- dentro de um range e agrupa por prioridade/condominio.
CREATE INDEX IF NOT EXISTS idx_chamados_sla
  ON chamados (criado_em DESC)
  INCLUDE (status, prioridade, condominio_id, primeira_resposta_em, tempo_resolucao_seg);
