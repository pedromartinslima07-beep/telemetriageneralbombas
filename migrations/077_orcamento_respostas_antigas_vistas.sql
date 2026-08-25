-- 077 — As respostas que já existiam nascem como "vistas"
--
-- A migration 076 criou `resposta_vista_em`, e NULO nela significa "ninguém do
-- escritório abriu ainda" — é o que acende o aviso na aba de orçamentos.
--
-- ⚠️ SEM ISTO, TODO ORÇAMENTO JÁ RESPONDIDO ACENDE O AVISO NO DEPLOY. Produção
-- tem respostas antigas, de clientes que já foram atendidos por telefone ou
-- WhatsApp na época; elas entrariam como coluna nula e o painel abriria
-- anunciando dezenas de "respostas que ninguém viu". Um aviso que nasce
-- gritando sobre trabalho que já foi feito ensina a ignorar o aviso — e aí ele
-- não serve para a primeira resposta de verdade que chegar.
--
-- Marca com `respondido_em` em vez de `now()` de propósito: a data de quando
-- alguém viu não pode ser mais recente que hoje sem ter sido hoje. Usando a
-- própria data da resposta, o registro fica coerente com a história — aquilo
-- foi tratado no seu tempo, fora deste sistema.
--
-- Idempotente pelo `IS NULL`: rodar de novo não toca em nada.

UPDATE public.orcamentos
   SET resposta_vista_em = respondido_em
 WHERE respondido_em IS NOT NULL
   AND resposta_vista_em IS NULL;
