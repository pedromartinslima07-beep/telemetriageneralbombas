-- 076 — Quem respondeu o orçamento, e se alguém já viu a resposta
--
-- ⚠️ `aprovado_por`/`respondido_por` guardam o ID DO USUÁRIO LOGADO, e isso
-- responde "qual conta respondeu", não "quem assumiu a decisão". A conta é do
-- condomínio; quem clica pode ser o síndico, o subsíndico ou quem estiver com
-- o e-mail aberto naquele dia. Numa conversa seis meses depois — "quem
-- autorizou este serviço?" — o id do usuário não resolve.
--
-- Por isso o nome e o cargo são DIGITADOS no momento da resposta e guardados
-- aqui, na aprovação e também na recusa: saber quem recusou vale tanto quanto.
-- Mesma natureza do que o módulo de contratos já faz com nome e documento.

ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS respondido_nome  VARCHAR(120),
  ADD COLUMN IF NOT EXISTS respondido_cargo VARCHAR(60);

-- ⚠️ NULO = NINGUÉM VIU AINDA. É o que faz a resposta virar aviso no painel
-- sem inventar linha em `alertas` — aquela tabela é amarrada a `device_id` e
-- existe para telemetria; um orçamento não tem sensor, e forjar um device_id
-- para caber ali seria dívida disfarçada de solução.
--
-- Preenche quando alguém do escritório abre a ficha do orçamento respondido.
ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS resposta_vista_em TIMESTAMPTZ;

-- Índice parcial: a consulta do aviso é sempre "respondidos que ninguém viu",
-- e ela roda a cada carregamento do painel. O parcial mantém o índice do
-- tamanho do problema real (poucas linhas) em vez do tamanho da tabela.
CREATE INDEX IF NOT EXISTS idx_orcamentos_resposta_nao_vista
  ON public.orcamentos (respondido_em DESC)
  WHERE respondido_em IS NOT NULL AND resposta_vista_em IS NULL;
