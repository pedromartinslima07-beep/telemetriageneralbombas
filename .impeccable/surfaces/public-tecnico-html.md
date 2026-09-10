---
version: 1
slug: "public-tecnico-html"
primary_target: "public/tecnico.html"
related_targets: ["public/tecnico.js","public/operador.css"]
---

## Escopo e modo

Painel do técnico, `/tecnico/painel` — `public/tecnico.html` / `tecnico.js`,
sobre a folha `public/operador.css` (bloco `.eq-*`). Modo **Operate**.

A tela nasceu de um defeito de login (10/09/2026): `PAINEL_POR_ROLE` mandava a
role `tecnico` para esse path e o Express não servia página nenhuma — só o app
Capacitor tinha painel. Fluxo e backend:
[`../../docs/modulos/equipamentos.md`](../../docs/modulos/equipamentos.md).

## Público e trabalho

Técnico de campo da General. **O celular é a cena principal, não a exceção** —
pedido do Pedro: *"o foco desse login é 100% mobile"*. Uma pergunta só: *onde
está esta peça e o que já aconteceu com ela*.

## Direção

*"O mais simples possível, no mesmo visual da tela do operador, não precisa
inventar"* — pedido literal do Pedro, e ele revogou uma primeira proposta de
composição própria (a bancada como prateleira de etiquetas). O mundo é herdado
inteiro; nada aqui é peça nova.

- A placa é a MESMA construção do `.pv-item` de Preventivas.
- O estado é o **cabeçalho do grupo**, nunca um selo por linha: a lista já
  agrupa por estado, e o selo repetia a palavra (e estourava a placa a 320px).
- A tela **acha, não age**. Quem registra é a ficha `/e/:codigo`, a mesma do QR.
- **Escanear etiqueta** é a única ação âmbar, e vem antes da busca: no celular,
  ler o QR é o caminho normal de chegar numa peça; digitar o código é o plano B.
  O diálogo é o `.fundo`/`.ficha` da folha e faz **uma coisa só**: apontar a
  câmera. Sem campo para digitar código — ele existiu e o Pedro o tirou; achar
  peça sem escanear é a busca da tela.

## Restrições

- HTML/CSS/JS puro, CSP `script-src 'self'`. Backend não muda:
  `GET /equipamentos` (guard `equipeInterna`) já entrega a tela inteira.
- Duas regras de celular da folha precisam de exceção por `body.tela-equip`:
  abaixo de 760px ela esconde o nome da tela, e abaixo de 420 esconde a
  `.barra-in`. Lá isso é certo (a marca disputa com três links de navegação);
  aqui deixava a barra com um avatar e nada mais. **Mexeu na barra? Meça a
  390 e a 320 antes de dar por fechado.**
- Sem folha própria: mesma barra, mesma gaveta de conta, mesmos diálogos do
  operador. A regra que continua valendo é a do topo do `operador.css` — ela
  não herda de `admin.css`.

- ⚠️ O laço de leitura é `setTimeout`, não `requestAnimationFrame`: o rAF não
  dispara em aba de segundo plano nem em janela sem foco, e aqui isso seria um
  retângulo preto que nunca lê. Medido.

## Em aberto

- Registrar movimentação direto da lista (hoje é só pela ficha).
- Escopo: qualquer técnico vê o parque inteiro, que é o que o endpoint já fazia.
