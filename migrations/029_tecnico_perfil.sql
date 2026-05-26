-- 029_tecnico_perfil.sql
-- Campos adicionais de cadastro do técnico: foto, documentos, nascimento, endereço

ALTER TABLE tecnicos
  ADD COLUMN IF NOT EXISTS foto_url    TEXT,
  ADD COLUMN IF NOT EXISTS cpf         TEXT,
  ADD COLUMN IF NOT EXISTS rg          TEXT,
  ADD COLUMN IF NOT EXISTS data_nascimento DATE,
  ADD COLUMN IF NOT EXISTS endereco    TEXT,
  ADD COLUMN IF NOT EXISTS observacoes TEXT;
