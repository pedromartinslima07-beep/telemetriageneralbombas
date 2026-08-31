-- 079 — o chamado que executa um orçamento aprovado.
--
-- Até aqui um orçamento aprovado morria na tela: o operador via "o Bosque
-- Verde autorizou a troca do selo mecânico" e tinha de abrir um chamado à
-- mão, digitando de novo prédio, serviço e constatação — sem nada ligando as
-- duas pontas depois. Quem perguntasse "esse orçamento chegou a ser
-- executado?" não tinha onde olhar.
--
-- `orcamento_id` é a ligação. SET NULL, e não CASCADE, pela mesma regra do
-- resto do schema (docs/banco-de-dados.md, tabela de FKs): apagar o registro
-- de negócio não pode apagar o chamado, que é histórico de atendimento e
-- pode até já ter O.S. e assinatura penduradas nele.
--
-- ⚠️ NÃO é UNIQUE. Um orçamento pode legitimamente gerar mais de um chamado
-- (o serviço volta, o prédio pede de novo). Quem impede o clique duplo é o
-- endpoint, que devolve o chamado ABERTO existente em vez de criar outro —
-- uma trava de UI, não de schema, porque a segunda visita é caso real.
ALTER TABLE chamados
  ADD COLUMN IF NOT EXISTS orcamento_id INTEGER REFERENCES orcamentos(id) ON DELETE SET NULL;

-- Parcial: a esmagadora maioria dos chamados não nasce de orçamento, e o
-- índice existe para responder "quais chamados são deste orçamento?".
CREATE INDEX IF NOT EXISTS idx_chamados_orcamento
  ON chamados (orcamento_id)
  WHERE orcamento_id IS NOT NULL;
