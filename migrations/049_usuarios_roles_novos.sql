-- Migration 049: atualiza constraint de roles em usuarios
-- Adiciona 'gerente' e 'operador' (criados na Fase RBAC mas sem migration de constraint).

ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_role_check;

ALTER TABLE usuarios ADD CONSTRAINT usuarios_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'admin_viewer'::text, 'cliente'::text, 'tecnico'::text, 'gerente'::text, 'operador'::text]));
