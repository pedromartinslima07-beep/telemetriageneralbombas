-- Migration 108: vários números de WhatsApp (Tech Provider) e coexistência.
--
-- Até aqui o sistema falava com UM número e UM token, fixos no Railway
-- (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN). Como Tech Provider, cada
-- empresa conecta o próprio número pelo cadastro incorporado e a Meta entrega
-- um token por empresa. Esta tabela guarda cada número conectado.
--
-- O número da equipe da General Bombas entra aqui também, em COEXISTÊNCIA: a
-- equipe segue no WhatsApp Business do celular e a IA responde pela Cloud API
-- no mesmo número. Ver docs/modulos/meta-tech-provider.md, seção Coexistência.
--
-- O token NUNCA fica em claro: `segredo_cifrado` é AES-256-GCM com a chave
-- WHATSAPP_TOKENS_CHAVE (src/services/whatsapp-cofre.service.js). Perdida a
-- chave, os números reconectam; não há como ler o que está aqui.
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS whatsapp_contas (
  id                 SERIAL PRIMARY KEY,
  nome               VARCHAR(255),                 -- nome verificado do número na Meta
  waba_id            VARCHAR(40)  NOT NULL,
  phone_number_id    VARCHAR(40)  NOT NULL UNIQUE,
  telefone_exibicao  VARCHAR(40),
  coexistencia       BOOLEAN      NOT NULL DEFAULT FALSE,
  -- O número que fala quando ninguém escolheu (aviso de sensor, conversa
  -- antiga sem número). No máximo um ativo.
  padrao             BOOLEAN      NOT NULL DEFAULT FALSE,
  status             VARCHAR(20)  NOT NULL DEFAULT 'ativa'
                     CHECK (status IN ('ativa', 'desconectada')),
  segredo_cifrado    TEXT,                         -- { token, pin } cifrados; NULL depois de desconectar
  conectado_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  conectado_por_id   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  desconectado_em    TIMESTAMPTZ,
  -- Coexistência: a Meta desconecta o número se a sincronização de contatos e
  -- de histórico não sair em 24h, e cada uma só pode ser pedida uma vez.
  sync_contatos_em   TIMESTAMPTZ,
  sync_historico_em  TIMESTAMPTZ,
  sync_tentativas    SMALLINT     NOT NULL DEFAULT 0,
  ultimo_erro        TEXT,
  atualizado_em      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_contas_padrao
  ON whatsapp_contas (padrao) WHERE padrao AND status = 'ativa';
CREATE INDEX IF NOT EXISTS idx_whatsapp_contas_waba ON whatsapp_contas (waba_id);

-- Por qual número a conversa acontece. NULL = o número fixo do Railway
-- (todas as conversas de antes desta migration).
ALTER TABLE conversas_whatsapp
  ADD COLUMN IF NOT EXISTS phone_number_id VARCHAR(40),
  -- Alguém da equipe respondeu pelo celular (eco da coexistência): a IA fica
  -- quieta nesta conversa até este instante. Cada eco empurra o prazo.
  ADD COLUMN IF NOT EXISTS ia_pausada_ate  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_conversas_phone_number_id
  ON conversas_whatsapp (phone_number_id) WHERE phone_number_id IS NOT NULL;

-- De onde saiu a mensagem de saída: NULL = sistema/IA/central (como sempre),
-- 'celular' = a equipe respondeu pelo WhatsApp Business (eco).
ALTER TABLE mensagens_whatsapp
  ADD COLUMN IF NOT EXISTS origem VARCHAR(20);
