-- Migration 067 — Índice para "meus chamados" do técnico
--
-- GET /chamados/meus filtra por ch.tecnico_id e é a consulta mais chamada do
-- app (roda no boot e a cada 30s de polling, por técnico em campo). Não havia
-- índice nessa coluna: o plano era Seq Scan na tabela inteira de chamados.
-- Irrelevante hoje, caro quando a tabela crescer.
--
-- Parcial (tecnico_id IS NOT NULL) porque chamado sem técnico atribuído nunca
-- é buscado por este caminho — o índice fica menor e mais rápido.

CREATE INDEX IF NOT EXISTS idx_chamados_tecnico
  ON chamados (tecnico_id, criado_em DESC)
  WHERE tecnico_id IS NOT NULL;
