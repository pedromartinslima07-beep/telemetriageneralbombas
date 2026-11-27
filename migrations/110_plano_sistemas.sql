-- Migration 110 — O que a preventiva cobre (27/11/2026)
--
-- Todo plano se chamava "Preventiva", e o técnico não sabia pelo sistema o que
-- fazer em cada prédio. O que cada contrato cobre estava só no texto da nota
-- do Omie (a O.S. do faturamento, `cDadosAdicNF`): a maioria é "sistema de
-- bombas + quadro de comando", mas há prédio sem bomba nenhuma (Malbec:
-- exaustão da churrasqueira e pressurização de escadas; Parkway: exaustão da
-- piscina; Habita Sustentável: fotovoltaico; Praça das Águas: trocador de
-- calor).
--
-- `sistemas` guarda as CHAVES da lista fixa em src/services/preventivas.service.js
-- (`SISTEMAS`). Lista vazia = ainda não informado, e a tela diz isso — não
-- "bombas" por padrão, que seria afirmar o que ninguém conferiu.

BEGIN;

ALTER TABLE planos_manutencao ADD COLUMN IF NOT EXISTS sistemas TEXT[] NOT NULL DEFAULT '{}';

COMMIT;
