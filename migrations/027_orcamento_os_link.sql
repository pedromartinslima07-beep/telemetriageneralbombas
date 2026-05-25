-- Vincula orçamentos avulsos a uma O.S. específica (opcional)
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS os_id INTEGER REFERENCES ordens_servico(id) ON DELETE SET NULL;
