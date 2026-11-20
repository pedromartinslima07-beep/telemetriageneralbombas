-- 098 — O escritório e o turno conversando pelo chamado (20/11/2026).
--
-- Duas marcas no chamado, uma em cada direção, pedido do Pedro:
--
--   * "Pedido do escritório" (escritorio_*): o admin marca um chamado com o
--     motivo ("cliente reclamou", "síndico VIP", "prioridade do dono"). O
--     painel do turno mostra um selo no item e na ficha. NÃO muda a ordem da
--     fila: lá manda o prazo que estoura primeiro (painel-operador.md).
--
--   * "Precisa do escritório" (pede_escritorio_*): o líder do turno marca um
--     chamado que depende de alguém do escritório (orçamento, cliente bravo,
--     falta de peça). Entra no "Precisa de você" do Hoje do admin, até alguém
--     dar como resolvido.
--
-- Marcar e desmarcar vão para o historico_chamados (campos 'pedido_escritorio'
-- e 'precisa_escritorio'), com o motivo no valor_novo.
-- Idempotente.

ALTER TABLE chamados
  ADD COLUMN IF NOT EXISTS escritorio_motivo      VARCHAR(300),
  ADD COLUMN IF NOT EXISTS escritorio_por         INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS escritorio_em          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pede_escritorio_motivo VARCHAR(300),
  ADD COLUMN IF NOT EXISTS pede_escritorio_por    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pede_escritorio_em     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS chamados_pede_escritorio_idx
  ON chamados (pede_escritorio_em) WHERE pede_escritorio_em IS NOT NULL;
