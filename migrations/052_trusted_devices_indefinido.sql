-- Trusted devices com validade indefinida + nome para identificação no admin
ALTER TABLE trusted_devices ALTER COLUMN expires_at DROP NOT NULL;
ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS nome TEXT;
