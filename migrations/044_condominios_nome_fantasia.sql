-- Adiciona nome_fantasia à tabela condominios.
-- nome (razão social) continua obrigatório; nome_fantasia é opcional
-- e serve como nome principal de exibição.
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS nome_fantasia TEXT;
