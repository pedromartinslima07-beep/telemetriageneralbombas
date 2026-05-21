-- Estende alerta_comentarios para servir como "thread de mensagens" do
-- chamado: cliente e técnico trocam texto e/ou foto durante o atendimento.
-- Quando alerta_origem='chamado' a linha vira uma mensagem do chamado.
-- foto_url é opcional (mensagem só com texto, só com foto, ou ambos).

ALTER TABLE alerta_comentarios
  ADD COLUMN IF NOT EXISTS foto_url TEXT;

-- O texto deixa de ser NOT NULL — agora pode ser nulo quando a mensagem
-- carrega só uma foto. Mantemos a constraint de "tem que ter algo": texto
-- OU foto.
ALTER TABLE alerta_comentarios
  ALTER COLUMN texto DROP NOT NULL;

ALTER TABLE alerta_comentarios
  DROP CONSTRAINT IF EXISTS alerta_comentarios_tem_conteudo;

ALTER TABLE alerta_comentarios
  ADD CONSTRAINT alerta_comentarios_tem_conteudo
  CHECK (texto IS NOT NULL OR foto_url IS NOT NULL);
