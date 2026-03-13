-- Dispositivos confiáveis para pular o 2FA por 30 dias
CREATE TABLE trusted_devices (
  id          SERIAL PRIMARY KEY,
  usuario_id  INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trusted_devices_token ON trusted_devices (token);
CREATE INDEX idx_trusted_devices_usuario ON trusted_devices (usuario_id);
