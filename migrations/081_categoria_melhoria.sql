-- Migration 081 — a categoria 'melhoria' nos chamados
--
-- A cláusula 7 da minuta descreve o P4 como "Melhorias, levantamentos,
-- adequações, solicitações estéticas ou serviços que dependam de
-- planejamento/orçamento". Não havia categoria para isso: esses pedidos caíam
-- em 'outro' e nasciam P3, com 72 horas de prazo de comparecimento — prazo de
-- corretiva não crítica para um pedido que a minuta manda AGENDAR.
--
-- Com a categoria passando a sugerir a prioridade (03/09/2026), 'melhoria' é o
-- que faz o P4 ser alcançável pela tela.
--
-- ⚠️ RECRIAR O CHECK, e não só somar o valor: o Postgres não tem "ADD VALUE"
-- para CHECK como tem para ENUM. DROP + ADD numa transação — sem isso, a janela
-- entre os dois aceita qualquer coisa.
--
-- ⚠️ NADA É RECLASSIFICADO. Chamados antigos em 'outro' que eram melhoria
-- continuam em 'outro': mexer neles mudaria a prioridade de chamados já
-- fechados, e com ela o histórico de SLA.

BEGIN;

ALTER TABLE chamados DROP CONSTRAINT IF EXISTS chamados_categoria_check;

ALTER TABLE chamados
  ADD CONSTRAINT chamados_categoria_check
  CHECK (categoria IS NULL OR categoria IN (
    'vazamento',
    'bomba_falha',
    'nivel_baixo',
    'sem_agua',
    'ruido',
    'manutencao',
    'melhoria',
    'outro'
  ));

COMMIT;
