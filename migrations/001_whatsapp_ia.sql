-- Migration 001: Módulo WhatsApp + IA
-- Execução: segura em produção, apenas additive
-- Pré-requisito: tabelas condominios e usuarios já existem

-- Vincula número de WhatsApp ao usuário/condomínio já cadastrado
CREATE TABLE IF NOT EXISTS clientes_whatsapp (
  id            SERIAL PRIMARY KEY,
  telefone      VARCHAR(30) UNIQUE NOT NULL,
  nome          VARCHAR(255),
  condominio_id INTEGER REFERENCES condominios(id) ON DELETE SET NULL,
  usuario_id    INTEGER REFERENCES usuarios(id)    ON DELETE SET NULL,
  criado_em     TIMESTAMPTZ DEFAULT NOW()
);

-- Uma conversa = uma sessão de atendimento via WhatsApp
CREATE TABLE IF NOT EXISTS conversas_whatsapp (
  id                  SERIAL PRIMARY KEY,
  cliente_whatsapp_id INTEGER REFERENCES clientes_whatsapp(id) ON DELETE CASCADE,
  status              VARCHAR(20) DEFAULT 'aberta' CHECK (status IN ('aberta', 'fechada')),
  criado_em           TIMESTAMPTZ DEFAULT NOW(),
  fechado_em          TIMESTAMPTZ
);

-- Cada mensagem trocada na conversa (entrada = cliente, saida = sistema/IA)
CREATE TABLE IF NOT EXISTS mensagens_whatsapp (
  id                   SERIAL PRIMARY KEY,
  conversa_id          INTEGER REFERENCES conversas_whatsapp(id) ON DELETE CASCADE,
  evolution_message_id VARCHAR(255) UNIQUE,
  direcao              VARCHAR(10)  NOT NULL CHECK (direcao IN ('entrada', 'saida')),
  tipo                 VARCHAR(30)  DEFAULT 'text',
  conteudo             TEXT,
  ia_categoria         VARCHAR(50),
  ia_urgencia          VARCHAR(20)  CHECK (ia_urgencia IN ('baixa', 'media', 'alta', 'emergencia')),
  ia_resumo            TEXT,
  criado_em            TIMESTAMPTZ DEFAULT NOW()
);

-- Chamados de suporte (abertos manualmente ou pela IA)
CREATE TABLE IF NOT EXISTS chamados (
  id             SERIAL PRIMARY KEY,
  conversa_id    INTEGER REFERENCES conversas_whatsapp(id) ON DELETE SET NULL,
  condominio_id  INTEGER REFERENCES condominios(id)        ON DELETE SET NULL,
  status         VARCHAR(20) DEFAULT 'aberto'  CHECK (status IN ('aberto', 'em_atendimento', 'fechado')),
  prioridade     VARCHAR(20) DEFAULT 'media'   CHECK (prioridade IN ('baixa', 'media', 'alta', 'emergencia')),
  titulo         TEXT NOT NULL,
  descricao      TEXT,
  responsavel_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em      TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ DEFAULT NOW(),
  fechado_em     TIMESTAMPTZ
);

-- Permite buscar chamados abertos de um condomínio rapidamente
CREATE INDEX IF NOT EXISTS idx_chamados_condominio_status
  ON chamados (condominio_id, status);

-- Permite buscar conversas de um cliente rapidamente
CREATE INDEX IF NOT EXISTS idx_conversas_cliente
  ON conversas_whatsapp (cliente_whatsapp_id);

-- Permite buscar mensagens de uma conversa rapidamente
CREATE INDEX IF NOT EXISTS idx_mensagens_conversa
  ON mensagens_whatsapp (conversa_id);

-- Vincula número de WhatsApp ao usuário já cadastrado (opcional, facilita lookup)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefone VARCHAR(30);
