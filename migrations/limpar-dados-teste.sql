-- ============================================================
-- limpar-dados-teste.sql
-- Apaga TODOS os dados de teste, mantendo apenas:
--   - usuarios (todos os roles — logins da equipe)
--   - tecnicos (perfis dos técnicos)
--   - configuracoes (prompt IA, intervalos, etc.)
--   - sla_definicoes (regras de SLA P1-P4)
-- ============================================================

BEGIN;

-- Deleta na ordem correta (filhos antes dos pais) SEM CASCADE em tabelas
-- que referenciam usuarios — evita apagar logins por cascata acidental.

-- 1. GPS dos técnicos
DELETE FROM tecnico_localizacoes_historico;
DELETE FROM tecnico_localizacoes;

-- 2. Mensagens e conversas WhatsApp
DELETE FROM mensagens_whatsapp;
DELETE FROM conversas_whatsapp;
DELETE FROM clientes_whatsapp;

-- 3. Chamados e dependentes (ordem: folhas → raiz)
DELETE FROM alerta_comentarios;
DELETE FROM historico_chamados;
DELETE FROM os_fotos;
DELETE FROM os_pecas;
DELETE FROM orcamento_linhas;
DELETE FROM orcamentos;
DELETE FROM ordens_servico;
DELETE FROM chamados;

-- 4. Planos de manutenção
DELETE FROM planos_manutencao;

-- 5. Contratos
DELETE FROM contratos;

-- 6. Alertas
DELETE FROM alertas;

-- 7. Leituras dos sensores
DELETE FROM leituras;

-- 8. Reservatórios e condomínios
DELETE FROM reservatorios;
DELETE FROM condominios;

-- 9. Tokens de sessão (temporários)
DELETE FROM login_codes;
DELETE FROM trusted_devices;

-- 10. Resetar sequences para IDs começarem do 1
ALTER SEQUENCE alertas_id_seq              RESTART WITH 1;
ALTER SEQUENCE condominios_id_seq          RESTART WITH 1;
ALTER SEQUENCE leituras_id_seq             RESTART WITH 1;
ALTER SEQUENCE reservatorios_id_seq        RESTART WITH 1;
ALTER SEQUENCE chamados_id_seq             RESTART WITH 1;
ALTER SEQUENCE conversas_whatsapp_id_seq   RESTART WITH 1;
ALTER SEQUENCE mensagens_whatsapp_id_seq   RESTART WITH 1;
ALTER SEQUENCE clientes_whatsapp_id_seq    RESTART WITH 1;
ALTER SEQUENCE ordens_servico_id_seq       RESTART WITH 1;
ALTER SEQUENCE orcamentos_id_seq           RESTART WITH 1;
ALTER SEQUENCE orcamento_linhas_id_seq     RESTART WITH 1;
ALTER SEQUENCE planos_manutencao_id_seq    RESTART WITH 1;
ALTER SEQUENCE contratos_id_seq            RESTART WITH 1;

COMMIT;
