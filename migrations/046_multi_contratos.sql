-- Remove a restrição de 1 contrato ativo por condomínio,
-- permitindo múltiplos contratos simultâneos por cliente.
DROP INDEX IF EXISTS idx_contratos_ativo_uniq;
