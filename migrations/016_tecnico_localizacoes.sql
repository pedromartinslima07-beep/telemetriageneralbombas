-- Migration 016 — GPS dos técnicos (Fase 7F)
-- 1) Liga cadastro de tecnico (tecnicos.id) ao login (usuarios.id) — necessário
--    pra POST /tecnicos/localizacao saber qual técnico está pingando via JWT.
-- 2) tecnico_localizacoes: 1 linha por técnico, sobrescrita a cada ping.
-- 3) tecnico_localizacoes_historico: append-only, limpa por job de retenção.

ALTER TABLE tecnicos
  ADD COLUMN IF NOT EXISTS usuario_id INTEGER UNIQUE REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tecnicos_usuario ON tecnicos(usuario_id);

CREATE TABLE IF NOT EXISTS tecnico_localizacoes (
  tecnico_id    INTEGER PRIMARY KEY REFERENCES tecnicos(id) ON DELETE CASCADE,
  lat           NUMERIC(9,6) NOT NULL,
  lng           NUMERIC(9,6) NOT NULL,
  precisao_m    NUMERIC(6,1),
  bateria_pct   INTEGER,
  capturada_em  TIMESTAMPTZ NOT NULL,
  atualizada_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tecnico_localizacoes_historico (
  id            BIGSERIAL PRIMARY KEY,
  tecnico_id    INTEGER NOT NULL REFERENCES tecnicos(id) ON DELETE CASCADE,
  lat           NUMERIC(9,6) NOT NULL,
  lng           NUMERIC(9,6) NOT NULL,
  precisao_m    NUMERIC(6,1),
  capturada_em  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tec_loc_hist
  ON tecnico_localizacoes_historico(tecnico_id, capturada_em DESC);
