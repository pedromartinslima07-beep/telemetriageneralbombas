-- Migration 048: adiciona cargo aos colaboradores (ex-técnicos)
-- Valores: tecnico | adm | gestor | ti
ALTER TABLE tecnicos
  ADD COLUMN IF NOT EXISTS cargo TEXT NOT NULL DEFAULT 'tecnico';
