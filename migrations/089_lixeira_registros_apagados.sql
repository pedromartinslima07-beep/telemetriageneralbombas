-- Migration 089 — Lixeira: nada de atendimento some sem deixar cópia
--
-- POR QUÊ (11/11/2026): as O.S. 1–13, os chamados 1–72 e os orçamentos 1–42
-- sumiram de produção sem rastro. O único caminho que bate é o "Excluir
-- permanentemente" do condomínio (DELETE /condominios/:id/hard): ele apaga em
-- cascata O.S., fotos, peças, chamados e orçamentos do prédio — e o modal só
-- avisava "reservatórios, leituras e alertas". pg_stat_user_tables mostrou 17
-- condomínios e 28 O.S. apagados; não havia como saber quais, nem recuperar.
--
-- O QUE FAZ: um trigger AFTER DELETE em cada tabela de atendimento copia a
-- linha inteira (to_jsonb(OLD)) para `registros_apagados` antes de ela sumir.
-- Vale para QUALQUER caminho — rota, cascata de FK, script, psql na mão —
-- porque mora no banco, não no código. Cascata dispara trigger de linha, então
-- o hard delete do condomínio deixa cópia de cada O.S., foto e chamado dele.
--
-- Quem apaga pode deixar o motivo: `SELECT set_config('app.contexto', '...', true)`
-- dentro da transação vai para a coluna `contexto`.
--
-- Fora de propósito: leituras, alertas, GPS e login_codes — os jobs de limpeza
-- apagam dezenas de milhares por dia e não são atendimento.
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS registros_apagados (
  id           BIGSERIAL PRIMARY KEY,
  tabela       VARCHAR(63) NOT NULL,
  registro_id  TEXT,
  dados        JSONB NOT NULL,
  contexto     TEXT,
  usuario_db   TEXT NOT NULL DEFAULT current_user,
  apagado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registros_apagados_tabela
  ON registros_apagados (tabela, registro_id);
CREATE INDEX IF NOT EXISTS idx_registros_apagados_quando
  ON registros_apagados (apagado_em DESC);

CREATE OR REPLACE FUNCTION fn_guardar_registro_apagado() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO registros_apagados (tabela, registro_id, dados, contexto)
  VALUES (
    TG_TABLE_NAME,
    to_jsonb(OLD) ->> 'id',
    to_jsonb(OLD),
    NULLIF(current_setting('app.contexto', true), '')
  );
  RETURN OLD;
END;
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ordens_servico', 'os_fotos', 'os_pecas',
    'chamados', 'historico_chamados',
    'orcamentos', 'orcamento_linhas',
    'condominios', 'reservatorios', 'contratos',
    'planos_manutencao', 'equipamentos'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_lixeira ON %I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_lixeira AFTER DELETE ON %I
           FOR EACH ROW EXECUTE FUNCTION fn_guardar_registro_apagado()', t);
    END IF;
  END LOOP;
END $$;
