-- 086 — Rastreio do envio da O.S. por e-mail ao cliente.
--
-- Mesmos nomes de coluna que `orcamentos` usa desde a 047 (`enviado_em`,
-- `enviado_para`): é o mesmo fato registrado sobre outro documento, e nome
-- diferente para a mesma coisa custa uma consulta ao schema toda vez.
--
-- `enviado_para` guarda a lista como TEXT separado por vírgula — igual ao
-- orçamento — porque o que interessa é conferir depois para onde foi, não
-- consultar por endereço.
--
-- Idempotente: pode rodar de novo sem efeito.

ALTER TABLE ordens_servico
  ADD COLUMN IF NOT EXISTS enviado_em   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enviado_para TEXT;
