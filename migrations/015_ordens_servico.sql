-- Migration 015 — Ordens de Serviço (Fase 7E)
-- Cria as 3 tabelas que persistem a O.S. digital do app mobile e vincula
-- ao chamado de origem. Numero da O.S. usa sequence própria (formato OS-{ano}-{seq}).

CREATE SEQUENCE IF NOT EXISTS os_numero_seq;

CREATE TABLE IF NOT EXISTS ordens_servico (
  id                  SERIAL PRIMARY KEY,
  numero              VARCHAR(20) UNIQUE NOT NULL,
  chamado_id          INTEGER REFERENCES chamados(id) ON DELETE SET NULL,
  condominio_id       INTEGER REFERENCES condominios(id),
  tecnico_id          INTEGER REFERENCES tecnicos(id) ON DELETE SET NULL,

  -- Tipos de serviço executados (ex.: ['vistoria_contrato','preventiva_mensal'])
  tipos_servico       TEXT[] NOT NULL DEFAULT '{}',

  -- Check-in / check-out por GPS (preenchidos pelo app)
  chegada_em          TIMESTAMPTZ,
  chegada_lat         NUMERIC(9,6),
  chegada_lng         NUMERIC(9,6),
  saida_em            TIMESTAMPTZ,
  saida_lat           NUMERIC(9,6),
  saida_lng           NUMERIC(9,6),

  -- Quem recebeu o atendimento
  recebido_nome       VARCHAR(255),
  recebido_tipo       VARCHAR(20),  -- 'gestor' | 'sindico' | 'portaria'

  -- Itens verificados (key-value flexível: { "comando_eletrico": true, ... })
  itens_verificados   JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Correntes elétricas medidas: { tipo: 'tri', valores: [3.2, 3.1, 3.3] }
  correntes           JSONB,

  observacoes         TEXT,

  -- Resolução
  servico_realizado   VARCHAR(20),  -- 'resolvido' | 'paliativo' | 'agravado'
  necessario_retorno  BOOLEAN NOT NULL DEFAULT false,
  retorno_sugerido_em DATE,

  -- Assinatura digital (PNG base64, ~10-30 KB)
  assinatura_b64      TEXT,

  -- URL do PDF gerado pelo backend ao finalizar
  pdf_url             TEXT,

  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalizada_em       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_os_chamado     ON ordens_servico(chamado_id);
CREATE INDEX IF NOT EXISTS idx_os_condominio  ON ordens_servico(condominio_id);
CREATE INDEX IF NOT EXISTS idx_os_tecnico     ON ordens_servico(tecnico_id);
CREATE INDEX IF NOT EXISTS idx_os_finalizada  ON ordens_servico(finalizada_em DESC);

CREATE TABLE IF NOT EXISTS os_fotos (
  id          SERIAL PRIMARY KEY,
  os_id       INTEGER NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  legenda     VARCHAR(255),
  tipo        VARCHAR(20),  -- 'antes' | 'depois' | 'geral'
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_os_fotos_os ON os_fotos(os_id);

CREATE TABLE IF NOT EXISTS os_pecas (
  id          SERIAL PRIMARY KEY,
  os_id       INTEGER NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
  descricao   VARCHAR(255) NOT NULL,
  quantidade  INTEGER NOT NULL DEFAULT 1,
  observacao  TEXT
);
CREATE INDEX IF NOT EXISTS idx_os_pecas_os ON os_pecas(os_id);

-- Vincula chamado à O.S. (PATCH /chamados/:id/executar exige isso preenchido)
ALTER TABLE chamados
  ADD COLUMN IF NOT EXISTS ordem_servico_id INTEGER REFERENCES ordens_servico(id) ON DELETE SET NULL;
