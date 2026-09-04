-- Migration 083 — o chamado cancelado
--
-- Até aqui o chamado tinha três saídas e só duas eram verdade: `aberto`,
-- `em_atendimento` e `fechado`. Não havia como desfazer um chamado aberto por
-- engano, duplicado, ou cujo cliente desistiu — a única saída era FECHAR, e
-- fechar diz "o serviço foi feito". Cada engano assim entrava na taxa de
-- resolução, no tempo médio e no histórico de SLA como atendimento cumprido.
--
-- ⚠️ FECHADO NÃO É CANCELADO, e a diferença não é vocabulário: `fechado`
-- alimenta `tempo_resolucao_seg`, a taxa de resolução e a métrica de tempo
-- médio. `cancelado` não alimenta nenhuma das três — o chamado sai da fila sem
-- entrar em conta nenhuma.
--
-- ⚠️ RECRIAR O CHECK, e não só somar o valor: o Postgres não tem "ADD VALUE"
-- para CHECK como tem para ENUM. DROP + ADD na mesma transação — sem isso, a
-- janela entre os dois aceita qualquer status. Mesmo motivo e mesma forma da
-- migration 081 (`chamados_categoria_check`).
--
-- O nome `chamados_status_check` é o que o Postgres gerou para o CHECK inline
-- da migration 001; conferido em 04/09/2026 contra o banco (pg_constraint).
--
-- `cancelado_em` é coluna PRÓPRIA, não reuso de `fechado_em`: `fechado_em` é
-- lido pelo CSV de `GET /relatorios/chamados` e pelos KPIs do painel como
-- "quando o serviço terminou". Escrever cancelamento nele faria a métrica
-- mentir exatamente onde esta migration existe para parar de mentir.
--
-- `cancelado_motivo` é obrigatório na rota (não no banco): chamado cancelado
-- sem o porquê recria a ambiguidade que o `fechado` tinha. O NOT NULL fica de
-- fora porque a coluna nasce vazia nas 12 linhas que já existem.

BEGIN;

ALTER TABLE chamados DROP CONSTRAINT IF EXISTS chamados_status_check;

ALTER TABLE chamados
  ADD CONSTRAINT chamados_status_check
  CHECK (status IN ('aberto', 'em_atendimento', 'fechado', 'cancelado'));

ALTER TABLE chamados
  ADD COLUMN IF NOT EXISTS cancelado_em     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelado_motivo TEXT;

COMMIT;
