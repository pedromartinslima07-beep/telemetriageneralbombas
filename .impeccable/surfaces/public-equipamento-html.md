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

## Momento memorável

O **trilho do ciclo** (No prédio → Oficina → Pronta → Devolvida) com a posição
acesa em âmbar, que acende da esquerda até onde a bomba está ao carregar a
página. É o único momento de movimento da tela, e é conteúdo real: sai das
movimentações, não é enfeite.

Segundo: **o tempo no estado** vira sinal operacional — 7 dias na oficina acende
âmbar, 15 acende vermelho. A pergunta da bancada é "há quanto tempo isso está
parado aqui".

## Restrições

- **Padrão do cartão da assinatura de contrato** (`_shell` em
  `src/routes/assinatura.routes.js`), pinado pelo Pedro em 2026-08-18: cartão
  único de 520px, fio âmbar→azul, logo, `table.info`, botão âmbar full width,
  rodapé fora. Folha autônoma — não carrega `admin.css`, como aquela tela.
- A paleta é duplicada da tela de assinatura de propósito (as duas não
  compartilham folha). Mudou uma, mude a outra.
- O detector acusa desvios de DESIGN.md: ele compara com o sistema "Chapa" da
  landing, e este cartão nunca esteve documentado lá. Falsos positivos.
- Campos a 16px — abaixo disso o iOS dá zoom ao focar e o formulário sai da vista.
- Alvos de toque ≥ 44px (mão com luva, tela suja).

## Em aberto

- Nunca foi aberta em **aparelho real**, escaneando uma etiqueta **impressa**.
- A etiqueta impressa (o PDF) continua genérica — texto em Arial, sem logo.
  É o próximo alvo natural e depende das decisões desta tela.
- Fase 12B (bancada: diagnóstico, peças, orçamento) vai acrescentar ações a esta
  mesma tela; "Outras ações" é onde elas entram sem quebrar a hierarquia.
