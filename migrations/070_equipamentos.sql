-- Migration 070 — Equipamentos (Fase A: identidade + QR)
--
-- Até aqui só `reservatorios` tinha identidade no sistema. Bomba, motor e
-- painel só existiam como texto solto em `os_pecas` ("trocou bomba X"), sem
-- vínculo com um objeto físico. Consequência prática na oficina: bomba na
-- bancada sem ninguém saber de qual condomínio veio nem qual era o defeito.
--
-- Esta migration dá identidade permanente ao equipamento. A etiqueta QR é do
-- EQUIPAMENTO, não da passagem pela oficina — a mesma bomba volta várias vezes
-- e o valor está justamente em ver as vezes anteriores.
--
-- Fase A cobre: identidade, vínculo com condomínio, fotos e linha do tempo.
-- Diagnóstico/peças/orçamento e o painel da bancada são Fase B — por isso o
-- CHECK de `status` já contempla os estados dessa fase (evita migration nova
-- só pra soltar constraint), mesmo sem UI ainda.

CREATE TABLE IF NOT EXISTS equipamentos (
  id                SERIAL PRIMARY KEY,

  -- Código impresso no QR. Base32 de 8 caracteres SEM I/L/O/U (alfabeto
  -- Crockford) pra não confundir na leitura humana quando o QR estiver
  -- ilegível de graxa. Aleatório, não sequencial: a URL da etiqueta não pode
  -- ser adivinhável (a ficha revela endereço de cliente).
  codigo            VARCHAR(12) UNIQUE NOT NULL,

  -- Lote de impressão (ex.: 'L2608A'). Permite reimprimir a folha inteira.
  lote              VARCHAR(20),

  -- Nullable de propósito: a etiqueta nasce EM BRANCO e é colada na bomba
  -- antes de existir cadastro. O vínculo acontece no ato da retirada.
  condominio_id     INTEGER REFERENCES condominios(id) ON DELETE SET NULL,

  tipo              VARCHAR(30),   -- bomba | motor | painel | quadro | boia | outro
  apelido           VARCHAR(120),  -- "Bomba 2 — recalque"
  marca             VARCHAR(120),
  modelo            VARCHAR(120),
  numero_serie      VARCHAR(120),
  potencia_cv       NUMERIC(6,2),
  tensao            VARCHAR(20),   -- 127 | 220 | 380 | trifásico...
  local_instalacao  TEXT,          -- "casa de máquinas, ao lado do quadro"

  -- O que o técnico relatou ao retirar. É a resposta pra segunda metade da
  -- dor original ("esquecem qual era o problema").
  defeito_relatado  TEXT,

  observacoes       TEXT,
  instalado_em      DATE,
  garantia_ate      DATE,

  -- Denormalizado a partir da última movimentação (mesma escolha de
  -- `reservatorios.last_seen`): listagem não precisa de LATERAL.
  status            VARCHAR(30) NOT NULL DEFAULT 'etiqueta_livre',

  ativo             BOOLEAN NOT NULL DEFAULT true,
  criado_por        INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  vinculado_em      TIMESTAMPTZ,
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'equipamentos_status_check'
  ) THEN
    ALTER TABLE equipamentos ADD CONSTRAINT equipamentos_status_check
      CHECK (status IN (
        'etiqueta_livre',        -- impressa, ainda não colada/vinculada
        'instalado',             -- no condomínio, funcionando
        'oficina',               -- retirada, na bancada
        'aguardando_orcamento',  -- Fase B
        'aguardando_peca',       -- Fase B
        'em_conserto',           -- Fase B
        'pronto',                -- consertada, aguardando devolução
        'devolvido',             -- entregue no condomínio
        'baixado'                -- sucata / substituída
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_equip_condominio ON equipamentos(condominio_id);
CREATE INDEX IF NOT EXISTS idx_equip_status     ON equipamentos(status);
CREATE INDEX IF NOT EXISTS idx_equip_lote       ON equipamentos(lote);

-- ---------------------------------------------------------------------------

-- Linha do tempo do equipamento. É o que responde "essa bomba já voltou 3x".
CREATE TABLE IF NOT EXISTS equipamento_movimentacoes (
  id              SERIAL PRIMARY KEY,
  equipamento_id  INTEGER NOT NULL REFERENCES equipamentos(id) ON DELETE CASCADE,

  tipo            VARCHAR(30) NOT NULL,
  status_novo     VARCHAR(30),   -- status do equipamento após esta movimentação

  chamado_id      INTEGER REFERENCES chamados(id)       ON DELETE SET NULL,
  os_id           INTEGER REFERENCES ordens_servico(id) ON DELETE SET NULL,
  orcamento_id    INTEGER REFERENCES orcamentos(id)     ON DELETE SET NULL,
  condominio_id   INTEGER REFERENCES condominios(id)    ON DELETE SET NULL,

  usuario_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  -- Snapshot do nome: todas as FKs acima são SET NULL, e histórico que perde
  -- o autor quando o usuário é apagado não serve como histórico.
  usuario_nome    VARCHAR(255),

  observacao      TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'equip_mov_tipo_check'
  ) THEN
    ALTER TABLE equipamento_movimentacoes ADD CONSTRAINT equip_mov_tipo_check
      CHECK (tipo IN (
        'cadastro',              -- etiqueta vinculada a um equipamento
        'retirada',              -- saiu do condomínio
        'entrada_oficina',       -- chegou na empresa
        'diagnostico',           -- Fase B
        'orcamento_solicitado',  -- Fase B
        'orcamento_aprovado',    -- Fase B
        'em_conserto',           -- Fase B
        'aguardando_peca',       -- Fase B
        'pronto',
        'devolucao',             -- devolvida/reinstalada no condomínio
        'anotacao',              -- nota livre, não muda status
        'baixa'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_equip_mov_equip
  ON equipamento_movimentacoes(equipamento_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_equip_mov_chamado ON equipamento_movimentacoes(chamado_id);
CREATE INDEX IF NOT EXISTS idx_equip_mov_os      ON equipamento_movimentacoes(os_id);

-- ---------------------------------------------------------------------------

-- Fotos do equipamento. `dados_base64` no banco, NÃO em disco: o filesystem
-- do Railway é efêmero e isso já mordeu em `os_fotos` (migration 053).
CREATE TABLE IF NOT EXISTS equipamento_fotos (
  id               SERIAL PRIMARY KEY,
  equipamento_id   INTEGER NOT NULL REFERENCES equipamentos(id) ON DELETE CASCADE,
  movimentacao_id  INTEGER REFERENCES equipamento_movimentacoes(id) ON DELETE SET NULL,
  dados_base64     TEXT NOT NULL,   -- data URL: data:image/jpeg;base64,...
  legenda          VARCHAR(255),
  criado_por       INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equip_fotos_equip ON equipamento_fotos(equipamento_id);

-- ---------------------------------------------------------------------------

-- Vínculo opcional do chamado com o equipamento — permite ver a reincidência
-- ("essa bomba já deu 3 chamados em 6 meses") sem passar pela O.S.
ALTER TABLE chamados
  ADD COLUMN IF NOT EXISTS equipamento_id INTEGER REFERENCES equipamentos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chamados_equipamento ON chamados(equipamento_id);
