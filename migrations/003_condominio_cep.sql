-- Migration 003: CEP do condomínio
-- Execução: segura em produção, apenas additive
-- Pré-requisito: tabela condominios já existe

-- CEP brasileiro com 8 dígitos. Guardamos só os números (sem máscara) — a
-- formatação "12345-678" é responsabilidade da UI ao exibir.
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS cep VARCHAR(8);
