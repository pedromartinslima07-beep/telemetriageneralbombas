---
tags:
  - projeto
  - fluxo
aliases:
  - Equipamentos
  - Etiqueta QR
  - Bancada
  - Oficina
---
# Fluxo: Equipamentos e etiqueta QR

Identidade permanente de bomba, motor, painel e quadro — e a etiqueta QR que
abre a ficha desse equipamento no celular.

## O problema que originou o módulo

Na oficina se acumulam bombas retiradas de condomínios para conserto. Sem
identidade, ninguém sabe de qual prédio veio nem qual era o defeito relatado —
a informação vivia na memória de quem foi buscar. Até aqui só `reservatorios`
tinha identidade no sistema; bomba aparecia apenas como texto solto em
`os_pecas` ("trocou bomba X"), sem vínculo com um objeto físico.

## Decisões estruturais

**A etiqueta é do equipamento, não da passagem pela oficina.** A mesma bomba
volta várias vezes, e é justamente o histórico das vezes anteriores que se
perde hoje. Etiqueta por ocorrência jogaria fora o ativo do módulo.

**A etiqueta nasce em branco.** A bomba chega na oficina antes de existir
cadastro — se o cadastro tivesse que vir primeiro, ninguém usaria. O lote de
etiquetas é impresso e fica na van; o vínculo com o condomínio acontece no ato
da retirada, com a bomba na mão.

**Sem plugin de scanner no app.** O QR aponta para uma URL e a câmera nativa do
Android já a abre. Um plugin de leitura mexeria no build Android, que está
sob o prazo da Play Store (roadmap 7J). Scanner dentro do app é Fase D.

**Código aleatório, não sequencial.** A ficha revela endereço e histórico de
cliente; uma URL adivinhável (`/e/1`, `/e/2`) exporia o parque inteiro a quem
tem um navegador. São 8 caracteres do alfabeto Crockford base32 (sem I, L, O e
U, que se confundem na digitação) — 32⁸ ≈ 1,1 trilhão de combinações.

## Ciclo (Fase A)

1. **Gerar lote** — `POST /equipamentos/lote` cria N etiquetas
   `status = 'etiqueta_livre'`, agrupadas por um rótulo de lote (`L2608A`).
2. **Imprimir** — `GET /equipamentos/etiquetas.pdf?lote=…` devolve a folha A4.
3. **Colar e vincular** — o técnico escaneia, cai em `/e/:codigo`, escolhe o
   condomínio, descreve o defeito e decide o destino:
   - **Registrar retirada** → `status = 'oficina'`, movimentação `retirada`;
   - **Só cadastrar** → `status = 'instalado'`, movimentação `cadastro`.
4. **Ficha** — qualquer pessoa da equipe que escanear vê condomínio, endereço,
   defeito relatado, fotos, dados técnicos e a linha do tempo completa.
5. **Registrar** — botões conforme o estado: pronta → devolver → instalado.
   Anotação é nota livre e **não** muda o status.

Diagnóstico, peças, solicitação de orçamento e o painel da bancada (o que está
parado e há quantos dias) são **Fase B** — ver [roadmap](../../memory-bank/roadmap.md).

## Estados

`etiqueta_livre` → `instalado` ⇄ `oficina` → `pronto` → `instalado`, com
`baixado` como saída final. `aguardando_orcamento`, `aguardando_peca` e
`em_conserto` já existem no CHECK da migration 070 mas só ganham UI na Fase B —
estão ali para a fase seguinte não precisar de migration só para soltar
constraint.

> `devolvido` está no CHECK e **não é usado**: após a devolução o estado
> verdadeiro é `instalado` ("está no prédio funcionando"), que é o que a
> bancada precisa ver para parar de contar a bomba como pendência.

## Quem enxerga

Guard `equipeInterna` (`src/middleware/equipeInterna.js`) — admin, gerente,
operador e **técnico**. É o quarto nível de acesso do painel e existe porque
quem escaneia na bancada é o técnico, que não passa em `adminOnly`. `cliente`
não entra em nenhuma rota do módulo: a ficha mostra dados de um condomínio que
pode não ser o dele.

`GET /equipamentos/condominios` existe pelo mesmo motivo — `GET /condominios` é
`adminOnly`, mas é o técnico quem aponta de qual prédio a bomba saiu. Devolve
só `id` e `nome`, nunca endereço, contato ou CNPJ.

## Etiqueta impressa

`src/services/etiquetas-pdf.service.js`, Puppeteer com browser singleton (mesmo
padrão de `orcamento-pdf.service.js`). O PDF sai em memória e vai direto na
resposta — não persiste em disco, que é efêmero no Railway.

- **Correção de erro `H`** (~30% do código recuperável): etiqueta de casa de
  máquinas vive com graxa, respingo e sol. O código humano impresso ao lado é o
  plano B quando nem isso resolve.
- **Dois formatos**: `corte` (padrão — papel comum com marcas de corte) e
  `pimaco6180` (folha adesiva pré-cortada de 10, 84,7 × 50,8 mm, onde a margem
  precisa bater com a picotagem e a borda tracejada é omitida).
- ⚠️ **`PUBLIC_BASE_URL`**: sem essa env o serviço deriva a URL do request e
  recusa gerar o PDF se o host for local (`&forcar=1` ignora, só para teste).
  Etiqueta é física e permanente — um QR apontando para `localhost` vira lixo
  colado numa bomba que ninguém vai reetiquetar.
- ⚠️ **Material**: papel comum descola em casa de máquinas (umidade, graxa,
  calor). Poliéster/vinil adesivo, ou papel adesivo com fita transparente larga
  por cima.

## Ficha (`/e/:codigo`)

`public/equipamento.html` + `equipamento.css` + `equipamento.js`. Página
autônoma que **carrega `admin.css`** pelos tokens do Mission Control: é
ferramenta de operação interna, como o app do técnico — não usa o sistema
"Chapa" da landing e do painel do cliente, que é peça de venda.

**Direção: "próxima ação única"** (2026-08-18). A tela responde *o que aconteceu
com essa bomba agora* e oferece **uma** ação, escolhida pelo estado; as demais
ficam recolhidas em "Outras ações". A primeira versão era quatro caixas de peso
igual (Registrar / Fotos / Dados / Histórico) — o layout que qualquer CRUD
produz. O contrato da direção está no topo de `equipamento.html`, como comentário
HTML; estratégia em `.impeccable/surfaces/public-equipamento-html.md`.

- **Um bloco elevado, o resto sem casca.** Só a decisão é superfície; dados,
  fotos e histórico são seções sobre o fundo separadas por fio. É o que cria
  hierarquia — repor cards ali devolve o problema original.
- **O trilho do ciclo** (No prédio → Oficina → Pronta → Devolvida) é conteúdo,
  não enfeite: a posição sai das movimentações. É o único momento de movimento
  da página (acende da esquerda até a posição atual, uma vez, respeitando
  `prefers-reduced-motion`).
- **Tempo no estado é sinal operacional:** 7 dias na oficina acende âmbar, 15
  acende vermelho. Calculado pela movimentação mais recente cujo `status_novo`
  é igual ao status atual — usar "a última que mexeu em status" mente quando o
  estado foi ajustado por outro caminho.
- **Mobile-first de verdade**: quem abre está de pé na bancada. Alvo de toque
  nunca abaixo de 44px; `font-size: 16px` nos campos, senão o iOS dá zoom ao
  focar e o formulário sai da vista.
- ⚠️ O **detector do Impeccable acusa ~20 desvios de DESIGN.md** nesta página.
  São falsos positivos estruturais: o `DESIGN.md` documenta o sistema "Chapa",
  e esta superfície é Mission Control por decisão. Não "corrigir" trocando os
  tokens — isso desfaz a fronteira registrada em
  [`decisions.md`](../../memory-bank/decisions.md).
- ⚠️ **A foto é carregada por `fetch` + blob, não por `<img src>` direto.** A
  rota da imagem é autenticada e `<img src>` não manda header `Authorization`.
  A saída fácil seria abrir a rota — é o que
  `/ordens-servico/:id/fotos/:id/imagem` faz — mas aqui o id da foto é
  sequencial e adivinhável, e o conteúdo é o interior da casa de máquinas de um
  cliente. Os object URLs são revogados a cada recarga da ficha.
- **Foto comprimida no navegador** antes de subir (máx. 1280px, JPEG 0.75):
  foto de celular tem 4-8 MB e em base64 infla ~33%, estourando o limite de
  8mb do `express.json`. Mesma lição da assinatura de e-mail e das fotos de O.S.
- **`/login?next=/e/CODIGO`**: sem isso o técnico escaneia, cai no login, entra
  e vai parar no painel — tendo que escanear de novo. O `next` é validado
  contra uma allowlist estreita em `public/login.js` (`^/e/[0-9A-Za-z-]{1,20}$`);
  um `next` livre seria open redirect, já que `//evil.com` é path válido para o
  navegador. Cliente nunca é redirecionado pelo `next` — tomaria 403.

## Admin

Seção **Equipamentos** (`data-section="equipamentos"`): listagem com busca e
filtro de estado, geração de lote e impressão da folha. Clicar numa linha abre
a **mesma** ficha que o QR abre — não existe versão "de escritório" que possa
divergir da versão da bancada. Escondida do `operador`, como O.S. e orçamentos.

⚠️ O PDF é gerado sob autenticação, então `window.open` na URL não funciona
(não manda o header e o servidor responde 401). O admin busca como blob e abre
o object URL.

## Cache

`/equipamentos` está na lista **network-first** do `public/sw.js`. Sem isso o SW
serviria a ficha no estado da semana passada em F5 — exatamente o que o módulo
existe para evitar. Ver [`../../CLAUDE.md`](../../CLAUDE.md).

## Referências

- Schema: [`../banco-de-dados.md`](../banco-de-dados.md) (migration 070)
- Endpoints: [`../api.md`](../api.md)
- Fluxo que alimenta a retirada: [`ordens-servico.md`](ordens-servico.md)
  (tipos `retirada_equipamento` e `devolucao`)
