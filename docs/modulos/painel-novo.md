---
tags:
  - projeto
  - fluxo
aliases:
  - Painel novo
  - PAINEL_NOVO
  - Painel legado
  - Liberar o painel novo
---
# Fluxo: o painel novo só para alguns logins (20/11/2026)

Pedido do Pedro: subir para produção o redesenho do admin
([redesenho-admin.md](redesenho-admin.md)) e a emissão pelo Omie
([omie-integracao.md](omie-integracao.md), [nota-fiscal.md](nota-fiscal.md))
**valendo só para um login**. Os outros logins continuam vendo o painel de
antes, sem mudança.

## Como liga

Variável **`PAINEL_NOVO`** no Railway: os e-mails liberados, separados por
vírgula (sem diferença de maiúscula). `*` libera todo mundo. Vazia ou ausente:
ninguém vê o painel novo.

```
PAINEL_NOVO=pessoa@empresa.com.br
```

Mudar a lista não pede que a pessoa saia e entre de novo: a página confere a
cada carregamento. No Railway, mudar a variável reinicia o serviço.

## Como funciona

| Peça | O que faz |
|---|---|
| `public/legado/` | cópia congelada do admin da `main` em `288abad` (`admin.html`, `admin.js?v=365`, `admin.css?v=273`): é o que os outros logins veem |
| `GET /admin/painel` | entrega o painel novo (`public/admin.html`) ou a cópia, pelo cookie `gb_painel`. Responde com `Vary: Cookie` |
| `GET /auth/painel` | com o token, diz `{ painel: "novo" \| "antigo" }` e grava (ou apaga) o cookie. O cookie leva o e-mail assinado com o `JWT_SECRET` e é `httpOnly` |
| `public/painel-escolha.js` | no `<head>` das duas páginas: pergunta ao `/auth/painel` e, se a resposta não bate com o `data-painel` da página aberta, recarrega uma vez |
| `painelNovoOnly` (`src/services/painel-novo.service.js`) | barra no servidor, pelo e-mail do **token**, o que grava no Omie |

O token mora no `localStorage`, então o pedido da página não traz login
nenhum. Por isso o cookie existe. A cada pedido o servidor confere a
assinatura **e** a lista: um cookie antigo de quem saiu da lista volta a dar
o painel antigo.

Só `admin` e `gerente` têm painel novo. As outras roles (`operador`,
`tecnico`, `cliente`) têm páginas próprias, que não mudam.

## O que fica preso ao login liberado

O cookie só escolhe a tela. As rotas que gravam no Omie recusam com **403**
quem não está na `PAINEL_NOVO`, mesmo chamadas direto:

- `GET/POST /agenda/faturamento/lote*` (o lote, o "Gerar boleto", liberar e
  tirar);
- `POST /admin/orcamentos/avulsos/:id/nota/emitir` (NFS-e e DANFE).

Assim `OMIE_EMISSAO=1` no Railway não abre a emissão para os outros logins.

## O que NÃO dá para separar

- **Servidor e banco são um só.** As migrations 090 a 097 rodam em produção
  para todos. Elas só acrescentam tabelas e colunas, e o painel antigo não as
  lê.
- **Rotas que mudaram na branch valem para todos.** O.S., chamados,
  orçamentos (agora paginados por `limit`/`offset`, mas sem parâmetro a
  resposta é a de antes), PDFs e e-mail. Conferido em 20/11/2026 no banco de
  teste: o painel antigo passou pelas 15 telas sem nenhuma resposta de erro.
- **A cópia do Omie de hora em hora** roda no servidor para todos. Ela só lê.

## Custo enquanto durar

- Conserto no painel antigo vai na cópia (`public/legado/`), não no
  `public/admin.*`. O `?v=N` da cópia é próprio.
- Trabalho novo entra só no painel novo.
- Para liberar para todos: `PAINEL_NOVO=*`. Depois de um tempo sem volta,
  apagar `public/legado/`, o `painel-escolha.js`, o `/auth/painel` e a escolha
  no `GET /admin/painel`.

## Testes

`scripts/testes/painel-novo.test.js` (35 casos, sem banco): a lista, o cookie
(trocado, forjado, sem assinatura), o `/auth/painel` por role, a página
escolhida pelo cookie, e o 403 de cada rota presa. Os testes que emitem
(`omie-lote.test.js`, `nota-fiscal-danfe.test.js`) liberam um e-mail de teste
na `PAINEL_NOVO`.

No `.env` local fica `PAINEL_NOVO=admin@teste.local`, o admin do banco de
teste, para o servidor de teste abrir o painel novo.
