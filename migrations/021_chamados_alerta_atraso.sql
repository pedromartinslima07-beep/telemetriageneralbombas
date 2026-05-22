-- Migration 021 — Alerta de chamado parado (Fase 7I)
-- Quando um chamado fica em `em_atendimento` por mais de X horas (configurável
-- via `chamados.alerta_atraso_horas`), o sistema notifica o admin por email.
--
-- Esta coluna controla anti-spam: guarda quando o último alerta foi enviado
-- para esse chamado. Permite re-notificar a cada X horas sem mandar duplicado.

ALTER TABLE chamados
  ADD COLUMN IF NOT EXISTS alerta_atraso_enviado_em TIMESTAMPTZ;

-- Sem índice — coluna é só lida no job (1× a cada N minutos) e os filtros
-- principais (status + atualizado_em) já têm os índices existentes.
