-- Migration 069 — Leads da landing page pública
--
-- A rota `/` deixou de redirecionar para `/login` e passou a servir uma página
-- pública de apresentação do produto (public/index.html). O formulário dessa
-- página grava aqui.
--
-- Este é o primeiro dado do sistema que entra SEM autenticação, então:
--   - nada aqui referencia condominios/usuarios (o lead ainda não é cliente);
--   - `status` acompanha o funil comercial de forma mínima, sem virar um CRM;
--   - `ip` fica registrado só para triagem de spam, não para rastreio.

CREATE TABLE IF NOT EXISTS leads (
  id           SERIAL PRIMARY KEY,
  nome         VARCHAR(200) NOT NULL,
  condominio   VARCHAR(200),
  email        VARCHAR(255) NOT NULL,
  telefone     VARCHAR(40),
  unidades     VARCHAR(40),               -- faixa ("ate-50", "51-150", ...), não número
  mensagem     TEXT,
  origem       VARCHAR(60)  DEFAULT 'landing',
  status       VARCHAR(20)  DEFAULT 'novo'
               CHECK (status IN ('novo', 'contatado', 'qualificado', 'descartado')),
  ip           VARCHAR(64),
  criado_em    TIMESTAMPTZ  DEFAULT NOW()
);

-- A listagem no admin é sempre "mais recentes primeiro".
CREATE INDEX IF NOT EXISTS idx_leads_criado_em ON leads (criado_em DESC);

-- Triagem por etapa do funil.
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status);
