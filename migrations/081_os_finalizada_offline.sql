-- 081 — O.S. finalizada sem sinal: o carimbo de quando o servidor recebeu
--
-- A O.S. é preenchida em casa de máquinas e subsolo. A etapa 3 do trabalho
-- offline deixa o técnico FINALIZAR sem rede, e o app envia quando o sinal
-- volta — mandando o horário em que ele terminou de verdade.
--
-- ⚠️ POR QUE ISTO PRECISA DE UMA COLUNA. Sem ela, uma O.S. terminada às 14h no
-- subsolo e sincronizada às 17h fica IDÊNTICA a uma terminada às 14h com sinal:
-- `finalizada_em` diz 14h e não existe mais nada. E `ordens_servico` não tem
-- `atualizado_em`, então não sobra nem um rastro indireto.
--
-- Isso importa porque `finalizada_em` passa a vir do RELÓGIO DO CELULAR, e o
-- relógio do celular pode estar errado. O carimbo do servidor é o que permite
-- auditar depois: "esta O.S. diz 14h, mas só chegou aqui às 17h". Sem ele,
-- confiar no cliente seria confiar no escuro.
--
-- NULL = finalizada com o servidor presente (o caminho normal).
-- Preenchida = o app mandou o próprio horário; o valor é quando CHEGOU.
ALTER TABLE ordens_servico
  ADD COLUMN IF NOT EXISTS sincronizada_em TIMESTAMPTZ;

COMMENT ON COLUMN ordens_servico.sincronizada_em IS
  'Quando o servidor recebeu a finalização, se ela veio do app com horário próprio (offline). NULL = finalizada online.';

-- Índice parcial: a esmagadora maioria é NULL, e a pergunta que se faz é
-- sempre "quais foram fechadas offline?".
CREATE INDEX IF NOT EXISTS idx_os_sincronizada_em
  ON ordens_servico (sincronizada_em)
  WHERE sincronizada_em IS NOT NULL;
