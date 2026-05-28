-- Migration 037 — Contexto do contato WhatsApp
--
-- Antes: clientes_whatsapp guardava só (telefone, nome auto-detectado do pushName,
-- condominio_id quando IA vinculava). Atendimento sempre começava do zero
-- perguntando "em nome de condomínio ou particular?", mesmo pra clientes recorrentes.
--
-- Agora: admin pode pré-cadastrar contatos com tipo definido (gestão de condomínio
-- vs pessoa física) — assim a IA já sabe com quem está falando logo na primeira
-- mensagem e cumprimenta pelo nome sem perguntar nada.

BEGIN;

ALTER TABLE clientes_whatsapp
  ADD COLUMN IF NOT EXISTS tipo            VARCHAR(20) NOT NULL DEFAULT 'desconhecido'
    CHECK (tipo IN ('gestao_condominio','pessoa_fisica','desconhecido')),
  ADD COLUMN IF NOT EXISTS cadastrado_por  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS observacoes     TEXT;

-- Backfill: registros com condominio_id já vinculado são tratados como gestão
-- (sem isso ficariam como 'desconhecido' e perderiam a economia de pergunta).
UPDATE clientes_whatsapp
   SET tipo = 'gestao_condominio'
 WHERE condominio_id IS NOT NULL AND tipo = 'desconhecido';

-- Index pra listar contatos de um condomínio (página admin)
CREATE INDEX IF NOT EXISTS idx_clientes_wpp_condominio
  ON clientes_whatsapp (condominio_id)
  WHERE condominio_id IS NOT NULL;

COMMIT;
