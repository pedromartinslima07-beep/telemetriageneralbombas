-- 075 — Limite de tentativas por código de login
--
-- O código de 6 dígitos era protegido só pelo `otpLimiter`, que conta por IP
-- (10 tentativas / 15 min). Quem tem muitos IPs — proxy residencial é barato —
-- contornava isso: o código continuava válido durante os 10 minutos inteiros e
-- cada IP novo comprava mais 10 chutes. São 1.000.000 de combinações, e não é
-- preciso cobrir todas para ter chance boa.
--
-- Com o contador aqui, o teto passa a ser do CÓDIGO, não do IP: erra 5 vezes,
-- o código morre e a pessoa pede outro. Quantos IPs o atacante tem deixa de
-- importar.

ALTER TABLE public.login_codes
  ADD COLUMN IF NOT EXISTS tentativas SMALLINT NOT NULL DEFAULT 0;
