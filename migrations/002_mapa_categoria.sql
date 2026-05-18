-- Migration 002: Coordenadas dos condomínios + categoria dos chamados
-- Execução: segura em produção, apenas additive
-- Pré-requisito: migration 001 aplicada (tabela chamados existe)

-- Coordenadas geográficas para exibição no mapa interativo
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS lat NUMERIC(9,6);
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS lng NUMERIC(9,6);

-- Categoria/tipo de problema do chamado (preenchido pela IA na abertura)
ALTER TABLE chamados ADD COLUMN IF NOT EXISTS categoria VARCHAR(30);

-- Constraint enum apenas se ainda não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chamados_categoria_check'
  ) THEN
    ALTER TABLE chamados
      ADD CONSTRAINT chamados_categoria_check
      CHECK (categoria IS NULL OR categoria IN (
        'vazamento',
        'bomba_falha',
        'nivel_baixo',
        'sem_agua',
        'ruido',
        'manutencao',
        'outro'
      ));
  END IF;
END $$;

-- Permite agregação rápida por categoria (cards do mapa)
CREATE INDEX IF NOT EXISTS idx_chamados_categoria_status
  ON chamados (categoria, status);
