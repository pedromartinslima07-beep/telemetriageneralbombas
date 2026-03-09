-- Adiciona role admin_viewer à constraint de usuarios
ALTER TABLE usuarios DROP CONSTRAINT usuarios_role_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'admin_viewer'::text, 'cliente'::text]));
