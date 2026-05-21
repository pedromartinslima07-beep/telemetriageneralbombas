-- Migration 017 — Liberar role 'tecnico' em usuarios (Fase 7C)
-- A constraint usuarios_role_check aceitava apenas admin / admin_viewer / cliente.
-- Adiciona 'tecnico' pra o app mobile (Capacitor) poder logar técnicos de campo
-- via JWT e resolver o registro deles em `tecnicos` via tecnicos.usuario_id.

ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_role_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'admin_viewer'::text, 'cliente'::text, 'tecnico'::text]));
