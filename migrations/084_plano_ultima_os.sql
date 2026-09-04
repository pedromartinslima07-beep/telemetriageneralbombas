-- 084_plano_ultima_os.sql
--
-- ⚠️ RENUMERADA DE 083 PARA 084 EM 04/09/2026, e o motivo importa: nasceu como
-- `083` na branch `fix/preventivas-acabamento` enquanto a `main` recebia, no
-- mesmo dia e em outra sessão, o `083_chamado_cancelado.sql`. Duas migrations
-- com o mesmo número é o tipo de coisa que só dói meses depois, quando alguém
-- roda a pasta em ordem e uma das duas some do histórico.
--
-- ⚠️ AS DUAS JÁ ESTAVAM APLICADAS EM PRODUÇÃO quando a colisão foi vista: a
-- coluna `ultima_os_id` existe no banco desde a branch, e o CHECK do
-- `chamados.status` também. Renumerar o ARQUIVO não desfaz nem reaplica nada —
-- o `IF NOT EXISTS` abaixo torna a re-execução inofensiva.
--
-- "Se o técnico for ao condomínio por outro chamado mas quiser aproveitar e
-- fazer a preventiva, ele marca essa opção na O.S. e o sistema conta como
-- preventiva realizada" — pedido do Pedro em 04/09/2026.
--
-- A caixa JÁ EXISTIA: `preventiva_mensal` é um dos nove `tipos_servico` da O.S.
-- desde a migration 015, e o exemplo escrito lá é literalmente
-- `['vistoria_contrato','preventiva_mensal']`. O que faltava era a LIGAÇÃO —
-- finalizar a O.S. fechava o chamado dela e nunca tocava em `planos_manutencao`.
--
-- ⚠️ ESTA COLUNA É A TRILHA DE AUDITORIA, não o estado. Quem responde "foi feita
-- neste mês?" continua sendo `ultima_em` dentro da competência (`feita_no_mes`
-- na rota do operador) — nada disso muda. O que faltava era poder dizer DE ONDE
-- veio a baixa: sem isso, uma preventiva marcada por uma O.S. de vazamento
-- aparece como feita sem nada que explique quem a fez, e ninguém consegue
-- desfazer um engano.
--
-- ⚠️ `ON DELETE SET NULL`: apagar uma O.S. não pode apagar o registro de que a
-- preventiva do mês aconteceu. O vínculo se perde; o fato, não.

ALTER TABLE planos_manutencao
  ADD COLUMN IF NOT EXISTS ultima_os_id INTEGER
    REFERENCES ordens_servico(id) ON DELETE SET NULL;

COMMENT ON COLUMN planos_manutencao.ultima_os_id IS
  'O.S. que deu a última baixa neste plano, quando ela veio de uma O.S. de outro chamado (tipos_servico contém preventiva_mensal). NULL quando a baixa veio do ciclo normal.';
