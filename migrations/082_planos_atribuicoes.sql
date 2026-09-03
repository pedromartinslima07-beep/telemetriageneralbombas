-- Migration 082 — Quem faz cada preventiva NESTE mês
--
-- Até aqui a única forma de dizer quem executa uma preventiva era a ZONA
-- (`planos_zona_responsavel`, migrations 059/066): o técnico abre o app e vê o
-- roteiro das zonas em que ele responde. Isso é atribuição PERMANENTE e por
-- REGIÃO — não dá para dizer "este mês o Cleber pega o Saint Antoine".
--
-- Em produção isso pesa: 11 técnicos ativos e **uma** zona com responsável
-- cadastrado. Na prática o despacho da preventiva acontece por fora do sistema.
--
-- Esta tabela é a atribuição do CICLO. Ela não substitui a zona: a zona
-- continua sendo o padrão de quem responde pela região, e esta diz quem foi
-- escalado desta vez.
--
-- ⚠️ POR QUE `competencia` E NÃO UM `tecnico_id` NO PLANO. A preventiva é
-- mensal e quem vai muda de mês para mês — férias, carga, um prédio que pede
-- alguém específico. Guardando no plano, a escala de setembro apagaria a de
-- agosto e o histórico de quem foi onde se perderia. Guardando por competência,
-- cada mês tem a sua e o passado fica legível.
--
-- ⚠️ `competencia` É SEMPRE O DIA 1 DO MÊS (DATE). O CHECK abaixo recusa
-- qualquer outro dia: sem ele, "2026-09-01" e "2026-09-15" seriam competências
-- diferentes para o mesmo mês, e o UNIQUE deixaria o mesmo plano ser atribuído
-- a dois técnicos.

BEGIN;

CREATE TABLE IF NOT EXISTS planos_atribuicoes (
  plano_id      INTEGER NOT NULL REFERENCES planos_manutencao(id) ON DELETE CASCADE,
  competencia   DATE    NOT NULL CHECK (EXTRACT(DAY FROM competencia) = 1),
  tecnico_id    INTEGER NOT NULL REFERENCES tecnicos(id) ON DELETE CASCADE,
  atribuido_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atribuido_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,

  -- Um plano tem UM responsável por mês. Dois técnicos escalados para o mesmo
  -- prédio no mesmo ciclo é a viagem perdida que esta tela existe para evitar.
  PRIMARY KEY (plano_id, competencia)
);

-- O lado que o app do técnico consulta: "o que é meu neste mês".
CREATE INDEX IF NOT EXISTS idx_planos_atrib_tecnico
  ON planos_atribuicoes (tecnico_id, competencia);

COMMIT;
