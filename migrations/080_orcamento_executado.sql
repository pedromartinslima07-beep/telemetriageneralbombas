-- 080 — o orçamento aprovado que JÁ FOI EXECUTADO.
--
-- A migration 079 deu ao chamado a memória de qual orçamento ele executa, e
-- com isso a tela "Aprovados" passou a saber três coisas: ninguém abriu
-- chamado ainda, tem chamado aberto, ou o chamado já fechou.
--
-- Falta a quarta, e ela é a mais comum no mundo real: **o serviço foi feito
-- SEM chamado nenhum**. O técnico já estava no prédio e resolveu na hora, ou
-- o orçamento foi executado antes de esta tela existir. Sem um lugar para
-- registrar isso, aqueles orçamentos ficam dizendo "Pode executar" para
-- sempre, e a lista vira um cemitério que o operador tem de aprender a
-- ignorar — que é o começo de não ler a tela.
--
-- ⚠️ NÃO MEXE EM `status`. A coluna continua `aprovado`, e de propósito: ela
-- é lida pelo admin, pelo painel do cliente e pelo PDF, e "executado" não é
-- um estado do DOCUMENTO — é um fato do atendimento. Inventar um status novo
-- obrigaria a revisar todo `WHERE status = 'aprovado'` do sistema para
-- descobrir quais deles ainda querem incluir os executados.
--
-- `executado_por` segue a regra de autoria da tabela de FKs
-- (docs/banco-de-dados.md): `ON DELETE SET NULL`, porque apagar o usuário não
-- pode apagar o registro de que o serviço foi feito.
ALTER TABLE orcamentos
  ADD COLUMN IF NOT EXISTS executado_em  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS executado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;

-- Parcial: a pergunta é sempre "quais já foram executados?", nunca o
-- contrário, e a esmagadora maioria das linhas tem a coluna nula.
CREATE INDEX IF NOT EXISTS idx_orcamentos_executado
  ON orcamentos (executado_em DESC)
  WHERE executado_em IS NOT NULL;
