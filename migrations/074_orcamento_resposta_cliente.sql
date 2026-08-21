-- Migration 074 — O cliente responde ao orçamento pelo painel
--
-- Até aqui o orçamento saía por e-mail com o PDF anexado e a resposta voltava
-- por fora do sistema (telefone, WhatsApp, e-mail solto). Quem registrava o
-- "aprovado" era alguém do escritório, no admin — então `aprovado_por` sempre
-- apontava para um usuário INTERNO, e não havia registro de que o cliente
-- tinha, ele mesmo, dito sim.
--
-- Agora o síndico entra no painel dele (mesmo login do sistema) e responde na
-- própria tela. O que já existia e continua servindo:
--   · `status`           — 'aprovado' | 'rejeitado' já são valores válidos
--   · `aprovado_em`      — quando foi aprovado
--   · `aprovado_por`     — FK usuarios, e o síndico É um usuário (role
--                          'cliente'), então a coluna serve para os dois casos
--   · `motivo_rejeicao`  — texto da recusa
--
-- ⚠️ Pessoa física / orçamento avulso NÃO entra neste fluxo, por decisão de
-- escopo: quem não tem condomínio não tem login, e a resposta dele continua
-- vindo por fora.

BEGIN;

ALTER TABLE orcamentos
  -- Comentário do cliente. Vale para APROVAÇÃO também, não só para recusa —
  -- é comum aprovar com ressalva ("pode fazer, mas só na semana que vem").
  -- Por isso é coluna própria e não reaproveita `motivo_rejeicao`, que só faz
  -- sentido quando a resposta é não.
  ADD COLUMN IF NOT EXISTS cliente_comentario TEXT,

  -- Carimbo da resposta, independente de qual foi. `aprovado_em` só marca o
  -- sim; sem esta coluna, uma recusa não teria data nenhuma.
  ADD COLUMN IF NOT EXISTS respondido_em TIMESTAMPTZ,

  -- Quem respondeu, separado de `aprovado_por`: este é sempre o CLIENTE que
  -- respondeu pelo painel. `aprovado_por` continua podendo ser alguém do
  -- escritório registrando por fora, e distinguir os dois é o ponto — sem
  -- isso não dá para saber se o "aprovado" veio do cliente ou de quem digitou.
  ADD COLUMN IF NOT EXISTS respondido_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;

-- A tela do cliente lista os orçamentos do condomínio dele que já foram
-- enviados; o índice cobre exatamente essa query.
CREATE INDEX IF NOT EXISTS idx_orcamentos_condo_status
  ON orcamentos (condominio_id, status)
  WHERE condominio_id IS NOT NULL;

COMMIT;
