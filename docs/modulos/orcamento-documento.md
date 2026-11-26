---
tags:
  - projeto
  - fluxo
aliases:
  - Orçamento como documento
  - Desconto no orçamento
  - Fotos no orçamento
---
# Fluxo: o orçamento como documento, com desconto e fotos (23/11/2026, migration 105)

Pedido do Pedro, depois da comparação da tela de orçamento com Omie, Bling,
Conta Azul, Jobber, ServiceTitan e Housecall Pro: *"faz os 6, 7 e 8 e melhora
visualmente"*. Os três itens da lista:

| # | Lacuna | O que virou |
|---|---|---|
| 6 | A O.S. tem foto, o orçamento não | Fotos no orçamento: vão no PDF e no painel do cliente |
| 7 | Desconto escondido no "total manual" | Desconto em % ou R$, com subtotal / desconto / total para o cliente |
| 8 | A tela é sempre um formulário aberto | Orçamento enviado abre como **documento**; "Editar" abre o formulário |

O "porquê" está em [decisions.md](../../memory-bank/decisions.md); o banco em
[banco-de-dados.md](../banco-de-dados.md), seção 105.

## O documento (item 8)

`public/admin-orc-doc.js`, pendurado no `_avRenderPainel` (o formulário do
`admin.js` não foi reescrito; o módulo acrescenta a coluna do documento, a
seção de fotos e os botões, e troca o modo pela classe `.av-layout.is-doc`).

- **Rascunho e orçamento novo** abrem no formulário, como sempre.
- **Enviado, aprovado e recusado** abrem como **documento**: a folha no
  desenho do que o cliente recebe — logo, número, tipo e data; cliente (com
  CNPJ e endereço do cadastro); constatação; itens com ficha técnica;
  subtotal, desconto e total; fotos; condições comerciais. O trilho da direita
  é o de sempre (total, situação, quem aprovou, PDF, envio, nota fiscal), só
  leitura: sem "Salvar", situação e tipo como texto.
- **Editar** (no cabeçalho, ao lado de Voltar) abre o formulário. No
  **aprovado** pede confirmação antes: alterar muda o documento que o cliente
  aprovou, e o painel e o PDF dele passam a mostrar a versão nova. (Exigir
  nova aprovação, como o Jobber faz, é o item 1 da comparação e ficou de fora.)
- **Salvar** volta ao documento. **Ver documento** sai da edição; com
  alteração não salva, pergunta antes e redesenha a partir do que está gravado
  (itens e fotos já foram gravados na hora, como sempre).

## Desconto (item 7)

No trilho, embaixo do total: `2 itens · definir manualmente · dar desconto`.
"Dar desconto" abre o campo (número + `%` ou `R$`); o total passa a ser
`subtotal − desconto`, e a linha de apoio mostra os dois. Desconto e total
manual não andam juntos: ligar um desliga o outro.

- Gravado em `orcamentos.desconto_tipo` / `desconto_valor` pelo
  `PATCH /admin/orcamentos/avulsos/:id` (só manda se o registro trouxe a chave,
  a mesma guarda do `valor`).
- ⚠️ **O total continua em `orcamentos.valor`.** Com desconto, o banco grava
  ali a soma menos o desconto (`fn_orcamento_aplicar_desconto`), e um
  **gatilho** em `orcamento_linhas` refaz a conta quando um item entra, muda ou
  sai, venha de qual rota vier. Por isso lista, PDF, painel do cliente,
  e-mail e nota fiscal (que leem `COALESCE(o.valor, soma)` em oito lugares)
  não precisaram mudar. Quem distingue "total manual" de "total com desconto"
  é `desconto_tipo` — no front, `_avTotalManual(o)`.
- **PDF:** com desconto os preços por item continuam (o total manual os
  esconde) e entram as linhas *Subtotal* e *Desconto (10%)* acima do VALOR
  TOTAL. Nos dois PDFs (peças e serviço).
- **Painel do cliente:** o rodapé da tabela vira Subtotal / Desconto / Total,
  e o aviso "o valor fechado é outro" não aparece.
- **Nota fiscal:** o total com desconto é o `valor`, então a nota rateia o
  desconto entre os itens como já fazia com o total manual.

## Fotos (item 6)

Seção **Fotos** no formulário, entre os itens e as condições comerciais.

- **Adicionar foto** (do computador ou do celular): o navegador reduz para
  1600 px no maior lado, JPEG 0,82, antes de subir — uma foto de 3,6 MB virou
  135 KB no teste. Até 12 por orçamento.
- **Fotos da O.S.** vinculada aparecem embaixo com "+ incluir": a linha aponta
  para a foto da O.S. (`os_foto_id`), sem copiar o arquivo. Tirar do
  orçamento não apaga a foto da O.S.
- Legenda por foto, gravada ao sair do campo. Mexer nas fotos grava na hora e
  não deixa o formulário "com alteração não salva".
- **PDF:** páginas próprias depois das condições, 4 fotos por página (2 × 2),
  com legenda, seção "4 Fotos".
- **Painel do cliente:** seção "Fotos" embaixo dos itens.
- A imagem é servida em `/admin/orcamentos/fotos/<chave>/imagem`, **pública**
  como a da O.S. (o `<img>` não manda token), com uma chave aleatória de 32
  caracteres para não dar para varrer.

Rotas em `src/routes/orcamento-fotos.routes.js`; ver [api.md](../api.md).

## Visual

A folha segue o registro de gestão do admin (cartão branco, fio de 1px, canto
de 10px, Martian Mono só em número). O formulário ganhou mais ar entre as
zonas. O painel do cliente segue o sistema Chapa (sem canto arredondado).

## Testes

Conferido no banco de teste (porta 3001, `PAINEL_NOVO`): desconto de 10%
gravado pela rota de verdade (390 → 351), gatilho com item mudado (480 → 432),
foto enviada e reduzida, legenda, documento, PDF com as duas novidades,
painel do cliente, rascunho abrindo no formulário, celular. Os testes que já
existiam passam: `pecas-da-os` 26/26, `orcamento-linha-produto` 21/21,
`orc-linha-excluir` 8/8, `orcamento-vincula-os` 22/22, `nota-fiscal-danfe`
98/98, `pecas-sem-cobranca` 13/13, `orcamento-vencimento` 44/44.

⚠️ O primeiro teste pela rota pegou um `42P18` (parâmetro sem tipo): o `$` do
`$N` sumiu na hora de escrever o código. Só apareceu exercitando o `PATCH` —
mais um caso do aviso do [CLAUDE.md](../../CLAUDE.md) sobre rota que grava.

## A página nova (26/11/2026)

A estrutura da página do orçamento mudou (maquete aprovada pelo Pedro):
ver [redesenho-admin.md](redesenho-admin.md#orçamento-e-nota-a-estrutura-nova-26112026).
