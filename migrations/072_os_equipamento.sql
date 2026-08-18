-- Migration 072 — O.S. sabe de qual equipamento trata (Fase 12C)
--
-- Fecha o triângulo que ficou aberto: `chamados` e `orcamentos` já apontam para
-- `equipamentos` (070 e 071), mas a O.S. — que é onde o técnico registra a
-- retirada da bomba no campo — não apontava.
--
-- Sem isso, o orçamento nascido de uma O.S. de conserto de bomba não tem como
-- saber qual bomba é, e a aprovação dele não move nada na bancada. Com a
-- coluna, `_garantirOrcamentoDaOs` propaga o vínculo e o reflexo que já existe
-- (equipamento-bancada.service.js) passa a valer para os dois caminhos.
--
-- SET NULL: dar baixa num equipamento não pode apagar a O.S., que é documento
-- assinado pelo cliente.

ALTER TABLE ordens_servico
  ADD COLUMN IF NOT EXISTS equipamento_id INTEGER REFERENCES equipamentos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_os_equipamento ON ordens_servico(equipamento_id);

-- Correção adjacente: orçamento criado a partir de uma O.S. nascia com
-- `origem = 'admin'` (o DEFAULT da coluna, migration 036), porque
-- `_garantirOrcamentoDaOs` não setava o campo. O backfill da 036 acertou os
-- antigos e os novos voltavam a errar desde então. O código já foi corrigido;
-- isto acerta o que ficou para trás.
UPDATE orcamentos SET origem = 'os'
 WHERE os_id IS NOT NULL AND origem <> 'os';
