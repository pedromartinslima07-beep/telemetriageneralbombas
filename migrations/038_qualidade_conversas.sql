-- Migration 038 — Curadoria de qualidade de conversas (Fase 10A)
--
-- Adiciona uma marcação manual de qualidade do atendimento em cada conversa
-- do WhatsApp. Preenchida pelos admins no painel após resolução.
--
-- Uso futuro: exportar conversas "excelente" + "boa" como dataset JSONL pra
-- few-shot prompting (10B) e eventual fine-tuning (10D) do modelo.

BEGIN;

ALTER TABLE conversas_whatsapp
  ADD COLUMN IF NOT EXISTS qualidade_atendimento VARCHAR(20)
    CHECK (qualidade_atendimento IS NULL
        OR qualidade_atendimento IN ('excelente','boa','aceitavel','ruim')),
  ADD COLUMN IF NOT EXISTS qualidade_avaliada_em  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS qualidade_avaliada_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;

-- Index parcial pra "exportar dataset curado": queries do tipo
-- WHERE qualidade_atendimento IN ('excelente','boa')
CREATE INDEX IF NOT EXISTS idx_conversas_qualidade_curada
  ON conversas_whatsapp (qualidade_avaliada_em DESC)
  WHERE qualidade_atendimento IN ('excelente','boa');

COMMIT;
