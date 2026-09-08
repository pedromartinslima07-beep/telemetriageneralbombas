---
version: 1
slug: "public-equipamento-html"
primary_target: "public/equipamento.html"
related_targets: ["public/equipamento.css","public/equipamento.js"]
---

# Ficha do equipamento — `/e/:codigo`

## Escopo e modo

**Operate.** A página que a etiqueta QR abre. Não é uma seção do admin: é uma
superfície autônoma, aberta pelo celular, fora do painel.

## Audiência e cena

Quem escaneia está **de pé na bancada da oficina**, com a bomba na frente e uma
mão ocupada — ou na casa de máquinas do condomínio, no momento da retirada. A
oficina é a cena dominante; o vínculo no condomínio é mais raro e mais curto.

Só equipe interna (`equipeInterna`: admin, gerente, operador, técnico). Cliente
não entra.

## Tarefa

Responder **de quem é essa bomba, há quanto tempo está parada e o que foi
relatado** — e então registrar o que aconteceu com ela. Não é uma tela de
consulta: termina em ação.

## Direção escolhida

**"Próxima ação única"** (candidato 3 de 7; seed `e87349e6`). A tela oferece
**uma** ação primária, escolhida pelo estado atual; as demais ficam recolhidas
em "Outras ações". Dados, fotos e histórico são referência abaixo, sem casca de
card.

Recusa explícita: a pilha de caixas de peso igual (Registrar / Fotos / Dados /
Histórico) da primeira versão — o layout que qualquer CRUD produz e que o Pedro
apontou como "100% genérico" em 2026-08-18.

## Mundo visual

**"Chapa" em registro de operação** — o mesmo do painel do operador e do admin,
adotado em 2026-09-08 a pedido do Pedro. A tela abre como **a etiqueta que
acabou de ser escaneada**: faixa marinho com o wordmark, o código Crockford em
Martian Mono e o estado, chanfrada a 45° no canto inferior direito como a
etiqueta impressa; placa clara embaixo, que é onde se lê e se edita. Engrenagem
marinho-sobre-marinho ao fundo, raio zero, nenhuma sombra projetada.

⚠️ Isto **substituiu** o pino anterior (o cartão da tela de assinatura de
contrato). O pino continua valendo para aquela tela, que não foi migrada.

## Momento memorável

O **trilho do ciclo** (No prédio → Oficina → Pronta → Devolvida) com a posição
acesa em âmbar, que acende da esquerda até onde a bomba está ao carregar a
página. É o único momento de movimento da tela, e é conteúdo real: sai das
movimentações, não é enfeite.

⚠️ E é a **única região amarela** da tela. O selo de estado, preenchido logo
acima dele, dava dois campos amarelos disputando e anulava a parada acesa — o
estado subiu para a faixa marinho, onde o amarelo é tinta e não campo.

Segundo: **o tempo no estado** vira sinal operacional — 7 dias na oficina acende
atenção, 15 acende crítico. A pergunta da bancada é "há quanto tempo isso está
parado aqui". Sobre a placa clara isso é a família `-t`, nunca o sinal saturado.

## Restrições

- Folha autônoma: **não carrega `admin.css`**, como a do operador. Os tokens do
  Chapa são duplicados de propósito — mudou a paleta, mude nas oito folhas.
- O detector fica limpo fora dos avisos de `font-size`, que o DESIGN.md registra
  como estado das oito folhas.
- Campos a 16px — abaixo disso o iOS dá zoom ao focar e o formulário sai da vista.
- Alvos de toque ≥ 44px (mão com luva, tela suja).

## Em aberto

- Nunca foi aberta em **aparelho real**, escaneando uma etiqueta **impressa**.
- ~~A etiqueta impressa continua genérica~~ — resolvido: o PDF ganhou faixa
  marinho, wordmark e chanfro, e é dele que esta tela herda a forma da cabeça.
- Fase 12B (bancada: diagnóstico, peças, orçamento) vai acrescentar ações a esta
  mesma tela; "Outras ações" é onde elas entram sem quebrar a hierarquia.
