-- Migration 109 — Qual preventiva cada contrato do Omie paga (27/11/2026)
--
-- O plano (`planos_manutencao`) e o contrato do Omie (`omie_contratos`) não se
-- conheciam. Sem esse elo, o lote do faturamento não tinha como avisar:
--   - dois contratos cobrando a mesma preventiva (Bradesco JF × RPS, outubro
--     de 2026: as duas notas saíram);
--   - contrato que cobra prédio sem preventiva ativa;
--   - preventiva rodando sem contrato em vigor.
--
-- O padrão NÃO precisa de linha aqui: o contrato paga a preventiva ativa do
-- prédio quando o prédio tem exatamente UMA (é o caso de quase todos, e os
-- setores — Bem Moema, Maison — caem juntos no plano do prédio). A linha só
-- existe quando alguém escolheu à mão:
--   - `plano_id` preenchido = este contrato paga este plano (prédio com dois
--     serviços: Air Club, Atua);
--   - `plano_id` NULO = "não é de preventiva" (o contrato não cobra visita).
--
-- Um contrato paga no máximo um plano; um plano pode ser pago por vários
-- contratos (os setores). Sem FK para `omie_contratos`: a cópia é refeita.

BEGIN;

CREATE TABLE IF NOT EXISTS plano_contratos_omie (
  omie_contrato  BIGINT PRIMARY KEY,                -- omie_contratos.omie_codigo
  plano_id       INTEGER REFERENCES planos_manutencao(id) ON DELETE CASCADE,
  ligado_por     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  ligado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS plano_contratos_omie_plano_idx ON plano_contratos_omie (plano_id);

COMMIT;
