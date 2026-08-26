-- 078 — A resposta do cliente vira pendência com baixa, não aviso de uma vez só
--
-- ⚠️ `resposta_vista_em` (076) fazia dois papéis ao mesmo tempo: registrar quem
-- abriu E apagar o aviso do painel. Como abrir a ficha é o suficiente para
-- marcar, um clique de passagem matava o único sinal de que um cliente havia
-- respondido — e depois disso nada na tela dizia QUAL orçamento era. Relato do
-- Pedro em 26/08/2026: *"alguém clica lá para ver uma vez e fecha, ou a tela
-- recarrega antes da pessoa ver qual o orçamento é, e a informação se perde"*.
--
-- Os dois papéis se separam aqui:
--   · `resposta_vista_em`    = alguém ABRIU (continua automático, e é o que
--                              permite dizer "aberta há 2h e ninguém deu baixa")
--   · `resposta_tratada_em`  = alguém DEU BAIXA (ação explícita; é o que apaga
--                              o aviso)
--
-- Ver e tratar não são a mesma coisa: a tela do cliente promete "entramos em
-- contato para agendar o serviço", e quem fecha essa promessa é o telefonema,
-- não o clique.

ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS resposta_tratada_em  TIMESTAMPTZ,
  -- FK de autoria com ON DELETE explícito (regra da 073): sem cláusula o
  -- Postgres assume NO ACTION e remover o usuário quebraria com 23503.
  ADD COLUMN IF NOT EXISTS resposta_tratada_por INTEGER
    REFERENCES public.usuarios(id) ON DELETE SET NULL;

-- ⚠️ BACKFILL, MESMA RAZÃO DA 077. Sem isto o aviso nasce gritando sobre
-- trabalho que o escritório já fez: tudo que alguém abriu antes de hoje
-- apareceria como pendência nova. Quem já tinha sido visto entra como tratado,
-- na data em que foi visto — é o mais próximo da verdade que existe no banco.
-- `resposta_tratada_por` fica nulo de propósito: ninguém deu baixa de fato.
UPDATE public.orcamentos
   SET resposta_tratada_em = resposta_vista_em
 WHERE respondido_em IS NOT NULL
   AND resposta_vista_em IS NOT NULL
   AND resposta_tratada_em IS NULL;

-- Índice parcial: a consulta do aviso é "respondidos sem baixa", e roda a cada
-- carregamento do painel. O parcial mantém o índice do tamanho do problema
-- real. O da 076 (`idx_orcamentos_resposta_nao_vista`) continua servindo à
-- distinção "ninguém abriu ainda" dentro do próprio aviso.
CREATE INDEX IF NOT EXISTS idx_orcamentos_resposta_sem_baixa
  ON public.orcamentos (respondido_em DESC)
  WHERE respondido_em IS NOT NULL AND resposta_tratada_em IS NULL;
