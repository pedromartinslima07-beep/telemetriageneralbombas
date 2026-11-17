-- 090 — Nota fiscal pelo Omie (etapas 1 e 2: NFS-e de orçamento só de serviço)
--
-- A General já emite NFS-e (serviço) e NF-e/DANFE (peças) à mão no Omie. A
-- regra combinada com o Pedro em 17/11/2026: UMA nota por orçamento —
--   • só serviço        → NFS-e (OS no Omie, faturada);
--   • qualquer peça     → só DANFE, com o serviço embutido no preço das peças.
--
-- Para decidir isso o sistema precisa saber, linha a linha, o que é peça e o
-- que é serviço — e até aqui não sabia: a linha é texto livre ("Bomba Thebe
-- 2cv", "MÃO DE OBRA ESPECIALIZADA", "CONSERTO Mod: ..."). `tipo_servico`
-- (068) não serve: ele só marca as linhas de limpeza/dedetização que o PDF
-- injeta em cláusula, e linha de peça e de conserto ficam ambas NULL.
--
-- `natureza` NULL = ninguém classificou ainda. O modal de emissão sugere
-- (por texto) e quem emite confirma; o que fica gravado é a confirmação.
--
-- Idempotente.

ALTER TABLE orcamento_linhas
  ADD COLUMN IF NOT EXISTS natureza VARCHAR(10);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamento_linhas_natureza_check') THEN
    ALTER TABLE orcamento_linhas
      ADD CONSTRAINT orcamento_linhas_natureza_check
      CHECK (natureza IS NULL OR natureza IN ('servico', 'peca'));
  END IF;
END $$;

-- A nota do orçamento. Uma só por orçamento (regra acima), então mora na
-- própria linha de `orcamentos`, e não numa tabela à parte.
--
-- ⚠️ `nota_status = 'processando'` é estado real, não intermediário de
-- código: depois do FaturarOS a prefeitura processa o RPS por conta própria,
-- e o número da NFS-e pode não existir ainda quando a rota responde. Quem
-- completa é o "Atualizar" (StatusOS / ListarNFSEs).
--
-- `omie_os_codigo` é o nCodOS do Omie. Junto com o código de integração
-- determinístico (ORC-<id>) é o que torna a emissão retomável: se a rede cair
-- entre o IncluirOS e o FaturarOS, o próximo clique acha a OS que já existe
-- em vez de criar outra — e duas OS seriam duas notas.
ALTER TABLE orcamentos
  ADD COLUMN IF NOT EXISTS nota_tipo          VARCHAR(5),
  ADD COLUMN IF NOT EXISTS nota_status        VARCHAR(15),
  ADD COLUMN IF NOT EXISTS nota_numero        VARCHAR(20),
  ADD COLUMN IF NOT EXISTS nota_url           TEXT,
  ADD COLUMN IF NOT EXISTS nota_valor         NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS nota_erro          TEXT,
  ADD COLUMN IF NOT EXISTS nota_solicitada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nota_emitida_em    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nota_emitida_por   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS omie_os_codigo     BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentos_nota_tipo_check') THEN
    ALTER TABLE orcamentos
      ADD CONSTRAINT orcamentos_nota_tipo_check
      CHECK (nota_tipo IS NULL OR nota_tipo IN ('nfse', 'nfe'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentos_nota_status_check') THEN
    ALTER TABLE orcamentos
      ADD CONSTRAINT orcamentos_nota_status_check
      CHECK (nota_status IS NULL OR nota_status IN ('processando', 'emitida', 'erro', 'cancelada'));
  END IF;
END $$;

-- Cache do código do cliente no Omie. 97 dos 118 condomínios já existem lá
-- (casados por CNPJ em 17/11/2026); guardar o código poupa uma consulta por
-- emissão e fixa o vínculo mesmo que alguém edite o CNPJ de um dos lados.
ALTER TABLE condominios
  ADD COLUMN IF NOT EXISTS omie_cliente_codigo BIGINT;
