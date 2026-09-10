-- Migration 085 — "Já foi feita": a baixa da preventiva marcada à mão
--
-- Pedido do Pedro em 10/09/2026: *"quero implementar na tela de preventiva do
-- operador para ele marcar q a preventiva já foi feita, igual tem em orçamentos
-- aprovados"*. Em Aprovados isso é a migration 080 (`orcamentos.executado_em`).
--
-- ⚠️ POR QUE UMA TABELA, E NÃO DUAS COLUNAS NO PLANO. Preventiva é MENSAL: o
-- mesmo plano é marcado à mão em setembro, executado normalmente em outubro e
-- marcado de novo em novembro. Colunas no plano guardariam só a última marcação
-- e apagariam a de setembro — a mesma razão pela qual `planos_atribuicoes`
-- (082) guarda a escala por competência em vez de um `tecnico_id` no plano.
--
-- ⚠️ E POR QUE ELA GUARDA AS DATAS ANTERIORES. Marcar como feita ROLA o ciclo
-- do plano (`ultima_em`, `proxima_em`, `ultima_os_id`), exatamente como
-- `darBaixaPorOS` e `executarPlano` fazem — sem isso o job reabriria o chamado
-- do mês no dia seguinte e a preventiva marcada voltaria como "em campo".
-- Rolar é destrutivo, e a marcação é de UM CLIQUE SEM CONFIRMAÇÃO: o desfazer
-- só devolve o plano ao estado exato de antes porque estas três colunas
-- lembram qual era ele.
--
-- ⚠️ `chamado_cancelado_id` É A OUTRA METADE DO DESFAZER. O job cria o chamado
-- P4 do mês sozinho e sem técnico; marcar a preventiva como feita cancela esse
-- chamado órfão (senão ele fica no roteiro pedindo um serviço que já aconteceu).
-- Guardar o id é o que permite reabri-lo no desfazer, em vez de deixar um
-- cancelamento sem volta como rastro de um clique errado.
--
-- ⚠️ `competencia` É SEMPRE O DIA 1 DO MÊS — mesmo CHECK da 082, e pelo mesmo
-- motivo: "2026-09-01" e "2026-09-15" seriam dois meses para o mesmo mês, e a
-- chave primária deixaria a mesma preventiva ser baixada duas vezes.

BEGIN;

CREATE TABLE IF NOT EXISTS planos_baixas_manuais (
  plano_id     INTEGER NOT NULL REFERENCES planos_manutencao(id) ON DELETE CASCADE,
  competencia  DATE    NOT NULL CHECK (EXTRACT(DAY FROM competencia) = 1),
  marcada_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  marcada_por  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,

  -- O estado do ciclo ANTES da baixa, para o desfazer devolver o plano exato.
  proxima_em_anterior   DATE,
  ultima_em_anterior    DATE,
  ultima_os_id_anterior INTEGER REFERENCES ordens_servico(id) ON DELETE SET NULL,

  -- O chamado do mês que a baixa cancelou, quando havia um. NULL quando não
  -- havia chamado nenhum — que é o caso comum de quem marca à mão.
  chamado_cancelado_id  INTEGER REFERENCES chamados(id) ON DELETE SET NULL,

  PRIMARY KEY (plano_id, competencia)
);

COMMENT ON TABLE planos_baixas_manuais IS
  'Preventiva dada como feita a mao na tela do operador. Uma linha por plano e competencia; guarda as datas anteriores do plano para o desfazer.';

COMMIT;
