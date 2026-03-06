-- Remove coluna device_key legada da tabela condominios
-- Esta coluna pertencia ao design antigo onde o device_key ficava no condomínio.
-- Hoje o device_key fica em reservatorios (por dispositivo).

DROP INDEX IF EXISTS public.idx_condominios_device_key_unique;
DROP INDEX IF EXISTS public.idx_device_key_unique;

ALTER TABLE public.condominios DROP COLUMN IF EXISTS device_key;
