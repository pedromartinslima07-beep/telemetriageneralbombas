-- 091 — Nota fiscal pelo Omie (etapa 3: DANFE de orçamento com peça)
--
-- Regra (Pedro, 17/11/2026): orçamento com qualquer peça sai em UMA DANFE,
-- com o serviço embutido no preço das peças. A NF-e exige que cada item seja
-- um PRODUTO CADASTRADO no Omie (NCM, unidade, tributação). A linha do
-- orçamento é texto livre ("Luva de união 60mm"), então alguém precisa dizer
-- "esta linha é o produto PRD00268". É o que esta migration guarda.
--
-- Levantamento de 18/11/2026 (orçamentos aprovados × catálogo do Omie): a
-- maioria das peças existe lá, mas o nome genérico casa com vários produtos
-- ("Adaptador com rosca" → 3 adaptadores diferentes, de NCM diferentes). Por
-- isso o sistema SUGERE e quem emite ESCOLHE; nada é casado sozinho.
--
-- Idempotente.

-- O produto escolhido para a linha de peça. NULL = ninguém escolheu.
ALTER TABLE orcamento_linhas
  ADD COLUMN IF NOT EXISTS omie_produto_codigo BIGINT;

-- O pedido de venda no Omie (o equivalente do omie_os_codigo da NFS-e) e a
-- NF-e que ele gerou. Mesma retomada da OS: código de integração ORC-<id>.
ALTER TABLE orcamentos
  ADD COLUMN IF NOT EXISTS omie_pedido_codigo BIGINT,
  ADD COLUMN IF NOT EXISTS omie_nf_codigo     BIGINT;

-- Cópia local do catálogo de produtos do Omie, para a busca do modal não
-- fazer 14 chamadas à API a cada tecla. Atualizada por
-- POST /admin/omie/produtos/sincronizar e sozinha quando passa de 24 h.
--
-- `vezes_faturado` e `ultimo_cfop` vêm dos pedidos JÁ FATURADOS à mão:
--   • vezes_faturado ordena a sugestão — entre três "adaptador com rosca", o
--     que a General de fato vende vem primeiro;
--   • ultimo_cfop é o CFOP com que o produto saiu da última vez. O cadastro
--     do produto no Omie tem `cfop` vazio em todos os 1.318 itens; quem decide
--     hoje é quem fatura (5.102 quase sempre, 5.405 nos itens com ST).
CREATE TABLE IF NOT EXISTS omie_produtos (
  codigo_produto     BIGINT PRIMARY KEY,
  codigo             VARCHAR(60),
  descricao          TEXT NOT NULL,
  ncm                VARCHAR(20),     -- há NCM com sufixo: 8413.91.90.01
  unidade            VARCHAR(10),
  valor_unitario     NUMERIC(14,4),
  inativo            BOOLEAN NOT NULL DEFAULT false,
  vezes_faturado     INTEGER NOT NULL DEFAULT 0,
  ultimo_cfop        VARCHAR(6),
  ultimo_faturado_em DATE,
  atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A primeira versão desta migration (só no banco de teste) tinha ncm(12).
ALTER TABLE omie_produtos ALTER COLUMN ncm TYPE VARCHAR(20);

-- Memória das escolhas: "Luva de união 60mm" já foi o PRD00268 da última vez.
-- A chave é a descrição NORMALIZADA (sem acento, minúscula, espaços únicos).
-- Gravada só quando o Omie aceita o pedido — escolha que ele recusou não ensina.
CREATE TABLE IF NOT EXISTS omie_produto_vinculos (
  descricao_norm TEXT PRIMARY KEY,
  codigo_produto BIGINT NOT NULL,
  vezes          INTEGER NOT NULL DEFAULT 1,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
