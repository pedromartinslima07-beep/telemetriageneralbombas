-- Armazena o conteúdo binário das fotos de OS diretamente no banco.
-- Necessário porque o Railway usa sistema de arquivos efêmero: o diretório
-- uploads/ é apagado a cada deploy/restart, perdendo fotos salvas em disco.
ALTER TABLE os_fotos
  ADD COLUMN IF NOT EXISTS dados_base64 TEXT;
