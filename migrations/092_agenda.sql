-- 092 — Agenda da empresa (fase A, 18/11/2026)
--
-- Pedido do Pedro: uma agenda "de verdade", que reúna tudo o que a empresa
-- tem a fazer, "desde manutenções até pagamento de funcionários", mais o
-- que vem do Omie. Esta migration guarda as duas coisas que o sistema ainda
-- não tinha:
--
--   1. COMPROMISSOS lançados à mão (reunião, visita comercial, pagamento,
--      outro), com repetição. O resto da agenda (retornos de O.S., contratos
--      vencendo, preventivas) já mora em outras tabelas e é LIDO de lá pela
--      rota, não copiado para cá.
--   2. CÓPIA dos contratos de serviço do Omie e das NFS-e que cada um gerou
--      no mês, para a agenda acompanhar o faturamento do dia 1 sem chamar a
--      API a cada clique (o Omie recusa a mesma consulta repetida em menos
--      de um minuto: "Consumo redundante detectado").
--
-- ⚠️ O SISTEMA NÃO EMITE ESSAS NOTAS. Elas saem pelo faturamento de
-- contratos do próprio Omie (71 no mesmo dia em 03/11/2026). A agenda só
-- acompanha; emitir pelos dois lados daria nota em dobro.
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS compromissos (
  id              SERIAL PRIMARY KEY,
  titulo          VARCHAR(160) NOT NULL,
  tipo            VARCHAR(20)  NOT NULL DEFAULT 'outro'
                  CHECK (tipo IN ('reuniao', 'visita', 'pagamento', 'financeiro', 'outro')),
  -- Data e hora de início. Compromisso de dia inteiro guarda 00:00 do dia.
  inicio          TIMESTAMPTZ  NOT NULL,
  fim             TIMESTAMPTZ,
  dia_inteiro     BOOLEAN      NOT NULL DEFAULT FALSE,
  -- Repetição simples: nenhuma, toda semana (mesmo dia da semana) ou todo
  -- mês (mesmo dia do mês; dia 29–31 cai no último dia em mês curto).
  repeticao       VARCHAR(10)  NOT NULL DEFAULT 'nenhuma'
                  CHECK (repeticao IN ('nenhuma', 'semanal', 'mensal')),
  repete_ate      DATE,
  condominio_id   INTEGER REFERENCES condominios(id) ON DELETE SET NULL,
  responsavel_id  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  descricao       TEXT,
  -- Pagamento de funcionário e o que for financeiro: só o admin vê
  -- (decisão do Pedro, 18/11/2026). A rota filtra; a tela não decide.
  so_admin        BOOLEAN      NOT NULL DEFAULT FALSE,
  criado_por      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- Apagar é marcar: a agenda é registro do que foi combinado.
  apagado_em      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS compromissos_inicio_idx ON compromissos (inicio) WHERE apagado_em IS NULL;

-- Contratos de serviço do Omie (servicos/contrato ListarContratos).
CREATE TABLE IF NOT EXISTS omie_contratos (
  omie_codigo     BIGINT PRIMARY KEY,         -- nCodCtr
  numero          VARCHAR(40),                -- cNumCtr ("2023/00003")
  omie_cliente    BIGINT,                     -- nCodCli
  situacao        VARCHAR(4),                 -- cCodSit ("10" = ativo)
  valor_mensal    NUMERIC(12,2),              -- nValTotMes
  dia_faturamento SMALLINT,                   -- nDiaFat
  vigencia_inicio DATE,
  vigencia_fim    DATE,
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- NFS-e geradas por contrato, por mês de emissão (servicos/nfse ListarNFSEs;
-- a nota traz OrdemServico.nCodigoContrato).
CREATE TABLE IF NOT EXISTS omie_contrato_notas (
  omie_nfse       BIGINT PRIMARY KEY,         -- Cabecalho.nCodNF
  omie_contrato   BIGINT NOT NULL,            -- OrdemServico.nCodigoContrato
  numero_nfse     VARCHAR(30),
  competencia     CHAR(7) NOT NULL,           -- 'AAAA-MM' da emissão
  emitida_em      DATE,
  valor           NUMERIC(12,2),
  status          VARCHAR(4),                 -- cStatusNFSe (F faturada, C cancelada)
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS omie_contrato_notas_comp_idx ON omie_contrato_notas (competencia, omie_contrato);

-- Quando a cópia foi atualizada pela última vez, e se deu erro.
CREATE TABLE IF NOT EXISTS omie_sincronizacoes (
  nome            VARCHAR(40) PRIMARY KEY,    -- 'faturamento_contratos'
  ultima_em       TIMESTAMPTZ,
  ultimo_erro     TEXT,
  detalhe         JSONB
);
