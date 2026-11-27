-- 111 — Agenda: concluir e mexer numa vez só da série (27/11/2026)
--
-- Pedido do Pedro: "hoje não dá para editar as coisas, não dá para marcar que
-- foi feito". Copiado das agendas profissionais (Google Agenda, Jobber):
--
--   1. Cada item ganha um "feito" (o círculo do Jobber).
--   2. Compromisso que repete continua UMA linha em `compromissos`; o que muda
--      numa vez só (feito, remarcada, título, cancelada) vira uma EXCEÇÃO da
--      série, guardada pela data/hora ORIGINAL da ocorrência — o mesmo
--      desenho do RECURRENCE-ID do iCalendar, que o Google também usa.
--      "Esta e as próximas" não precisa de tabela: corta a série velha
--      (`repete_ate`) e cria uma nova a partir dali.
--   3. Retorno de O.S. e contrato terminando não são compromissos (a agenda os
--      lê de `ordens_servico` e `contratos`), então o "feito" deles mora em
--      `agenda_feitos`.
--
-- Aditiva e idempotente. ⚠️ O código da agenda lê as duas tabelas: rodar em
-- PRODUÇÃO ANTES do push (push na main = deploy).

CREATE TABLE IF NOT EXISTS compromisso_ocorrencias (
  id              SERIAL PRIMARY KEY,
  compromisso_id  INTEGER NOT NULL REFERENCES compromissos(id) ON DELETE CASCADE,
  -- Início ORIGINAL da ocorrência na série (a chave). Num compromisso que não
  -- repete é o próprio `compromissos.inicio`, e a rota acompanha quando ele muda.
  ocorrencia_em   TIMESTAMPTZ NOT NULL,
  -- "Apagar só esta".
  cancelada       BOOLEAN NOT NULL DEFAULT FALSE,
  -- O que mudou só nesta vez (NULL = igual à série).
  inicio          TIMESTAMPTZ,
  fim             TIMESTAMPTZ,
  titulo          VARCHAR(160),
  descricao       TEXT,
  responsavel_id  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  -- Feito.
  concluido_em    TIMESTAMPTZ,
  concluido_por   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (compromisso_id, ocorrencia_em)
);
CREATE INDEX IF NOT EXISTS compromisso_ocorrencias_inicio_idx
  ON compromisso_ocorrencias (inicio) WHERE inicio IS NOT NULL;

CREATE TABLE IF NOT EXISTS agenda_feitos (
  fonte           VARCHAR(20) NOT NULL CHECK (fonte IN ('retorno', 'contrato')),
  ref_id          INTEGER NOT NULL,           -- ordens_servico.id / contratos.id
  concluido_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  concluido_por   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  PRIMARY KEY (fonte, ref_id)
);
