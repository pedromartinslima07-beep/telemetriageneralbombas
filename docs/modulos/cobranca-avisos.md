---
tags:
  - projeto
  - fluxo
aliases:
  - Avisos de cobrança
  - Cobrança automática
  - E-mail da nota
---
# Fluxo: o e-mail da nota e os avisos de cobrança (23/11/2026)

Pedido do Pedro em 23/11/2026, em duas partes que usam **a mesma lista de
e-mails**:

1. A nota emitida pelo sistema tem que ir ao cliente **pelo próprio Omie,
   para os mesmos e-mails de hoje** ("hoje qnd emitimos nota pelo omie ele msm
   envia nos emails cadastrados la, quero q continue assim").
2. Cobrança automática por e-mail: lembrete antes do vencimento, "vence hoje"
   e cobrança do atraso, **no mesmo estilo do envio da O.S.**, para os mesmos
   e-mails para os quais a nota foi.

Parte da fase 3 da [integração com o Omie](omie-integracao.md). Migration
**102**.

## 1. O e-mail da nota

### O que a leitura do Omie mostrou (só leitura, 23/11/2026)

- Toda O.S. feita na tela do Omie leva o bloco **`Email`**: `cEnvLink` (link da
  NFS-e), `cEnvBoleto` (boleto) e **`cEnviarPara`** (os destinatários). As 300
  mais recentes têm destinatário.
- **O destinatário não é o e-mail do cadastro do cliente.** Nos clientes
  conferidos, o `email` do cadastro é da própria General; a nota vai para os
  e-mails do síndico, guardados **em cada O.S.** Em 40 de 59 clientes a lista
  mudou de uma nota para outra.
- O padrão de 2026: **o cliente + uma cópia para a General** (158 das 187 O.S.
  de contrato de set–nov; 10 das 11 avulsas).
- **A nota emitida pelo sistema não mandava esse bloco** — o Omie não tinha
  para quem mandar. Corrigido aqui, antes da primeira nota real.
- O pedido de venda (DANFE) tem o equivalente: `informacoes_adicionais.enviar_email`
  ("S": DANFE, XML e o boleto) e `utilizar_emails` (separados por vírgula).

### Como ficou

- **De onde vem a lista** (`omie-emails.service.js`): a O.S. mais recente do
  cliente no Omie **que não foi cancelada** (`ListarOS` com
  `filtrar_por_cliente`, `ordem_decrescente`); sem O.S., o pedido mais recente
  (`ListarPedidos`); sem nenhum, o e-mail do cadastro; cliente que ainda não
  está no Omie (prédio criado na emissão), o e-mail do prédio aqui. Guardada
  12 h em `omie_cliente_emails`, com o número e a data da nota de origem.
- **No modal da nota**: campo "E-mail da nota", já preenchido, com a frase de
  onde veio ("os mesmos da O.S. 1234 de 03/11/2026 no Omie") e o aviso quando
  essa nota tem mais de um ano. Dá para corrigir. Vazio pede confirmação ("o
  Omie não vai mandar nada ao cliente").
- **Na emissão**: a O.S. leva `Email { cEnvLink: "S", cEnvBoleto: "S" (ou "N"
  sem boleto), cEnvRecibo: "N", cEnviarPara }`; o pedido leva `enviar_email:
  "S"` e `utilizar_emails`. A lista usada fica em `orcamentos.nota_emails`.
  E-mail inválido é 400 antes de qualquer coisa.
- **Quem manda o e-mail da nota continua sendo o Omie**, com o modelo, o
  remetente e os anexos de lá.

⚠️ **A conferir na primeira nota real:** se o Omie gera o boleto sozinho no
faturamento quando `cEnvBoleto = S` (o `gerarBoletos` do sistema confere se o
título já tem boleto antes de pedir, então não sai em dobro), e se o e-mail do
Omie sai com o boleto anexado ou antes dele existir.

## 2. Os avisos de cobrança

### Regras (Configurações, sem deploy)

| Etapa | Quando | Chave |
|---|---|---|
| Lembrete | de 1 a N dias antes do vencimento | `cobranca.dias_antes` (padrão 3; 0 desliga) |
| Vence hoje | o Omie diz "VENCE HOJE" (inclui o que venceu no fim de semana) | — |
| 1ª cobrança | de N dias de atraso até antes da 2ª | `cobranca.atraso_1` (padrão 3) |
| 2ª cobrança | de N até N+7 dias de atraso | `cobranca.atraso_2` (padrão 10) |

Depois da 2ª, o sistema para: o título segue em "Em atraso" para ligar.

- **Só os títulos que o sistema emitiu** (a regra da aba "Em atraso"): notas
  de orçamento e o lote dos contratos.
- **Para quem**: `orcamentos.nota_emails` na nota de orçamento; nos contratos,
  os da nota mais recente do cliente no Omie (o mesmo `omie-emails.service`).
  Sem lista, o aviso fica em "Sem e-mail" e dá para digitar só naquele aviso.
- **Uma vez só**: `UNIQUE (omie_titulo, etapa, vencimento)`. O aviso pendente
  cuja etapa passou, ou cujo título foi baixado no Omie ou marcado pago aqui,
  vira `expirado` e não sai atrasado.

### A fila e o envio

- A sincronização de hora em hora passa a copiar também os títulos do sistema
  **a vencer** (`omie_receber_avencer`, `ListarContasReceber` com
  `AVENCER` e `VENCEHOJE`). ⚠️ O título volta com o status escrito com espaço:
  "A VENCER", "VENCE HOJE". Lido em 23/11/2026: 24 e 6 títulos, todos com
  boleto. Se essa leitura falhar, os atrasados seguem copiados.
- O job `cobranca-avisos.job.js` (a cada 30 min, `cobranca.avisos_intervalo_min`)
  monta a fila do dia. A tela também refaz a fila quando abre.
- **Financeiro → Avisos** (só o admin, só o painel novo, `#/financeiro/avisos`):
  chips Para enviar · Sem e-mail · Enviados · Todos; envio em lote pela
  seleção ou "Enviar N avisos"; no painel, "Ver o e-mail" (a prévia exata),
  o destinatário editável, "Enviar este", "Tirar da fila"; "Regras" abre os
  dias e o envio automático. Os avisos para enviar entram no "Pede ação", e o
  painel de "Em atraso" mostra os avisos de cada título.
- **Envio automático**: desligado. Ligado (`cobranca.avisos_automatico`), o job
  manda sozinho, **só em dia útil, das 8h às 18h**.
- **O e-mail** (`email.montarCobranca`/`sendCobrancaCliente`): a moldura da
  O.S., sobrancelha "Lembrete de vencimento" / "Vence hoje" / "Boleto em
  aberto", a caixa "Informações do boleto" (cliente, nota, parcela,
  vencimento, dias em aberto), o link da nota quando o sistema tem, e **o PDF
  do boleto anexado** (lido na hora do `ObterBoleto`: o link do Omie vale 24 h).
  **Sem valor no corpo** — é a regra da moldura; o valor está no boleto.
  `replyTo` é o comercial, para o cliente responder com o comprovante.

⚠️ **EXIGE `COBRANCA_EMAIL=1` NO SERVIDOR**, para o envio manual e para o
automático. O banco de teste recebe a cópia real do Omie quando o servidor
local roda com as chaves: sem a trava, um `npm run dev` mandaria cobrança a
cliente de verdade. No `.env` local ela não existe.

## Testado

- `scripts/testes/cobranca-avisos.test.js` **40/40** (Omie e envio simulados):
  o bloco Email da O.S. e do pedido; os destinatários (O.S. não cancelada,
  pedido, cadastro, guardados); a cópia dos a vencer; as etapas nas bordas
  das janelas; a fila (e-mails da nota, sem e-mail, pago fora, sem duplicar,
  expiração); 503 sem `COBRANCA_EMAIL`; envio com o PDF do boleto, para os
  destinatários certos, uma vez só; prévia, ignorar, trocar destinatário,
  regras; 403 para gerente e para admin fora do painel novo; e-mail inválido
  na emissão.
- `omie-cobranca` 27/27, `nota-fiscal-danfe` 98/98 e `guias-tributos` 46/46
  seguem verdes.
- Leitura real no Omie (só leitura) dos destinatários de um cliente.
- Na tela (banco de teste, títulos de mentira): a aba Avisos, a fila, a
  prévia do e-mail, as regras, o aviso sem e-mail e o destinatário digitado;
  a prévia da nota devolvendo a lista "da O.S. 1234 de 03/11/2026".
- **Não visto na tela**: o campo "E-mail da nota" dentro do modal (a prévia
  do servidor foi conferida; o desenho do campo, não). **Nunca mandado de
  verdade**: nenhum e-mail de cobrança, nenhuma nota com o bloco Email.

## O que falta

- ✅ Migration **102** em produção (conferida em 23/11/2026).
- `COBRANCA_EMAIL=1` no Railway quando for começar a mandar.
- A primeira nota real pelo sistema, conferindo que o e-mail do Omie chegou
  ao síndico (e com o boleto).
- Os primeiros avisos aprovados à mão; depois, decidir ligar o automático.
- WhatsApp: precisa de um modelo de mensagem aprovado pela Meta (a API só
  deixa mandar texto livre para quem escreveu nas últimas 24 h).

## Arquivos

`migrations/102_cobranca_avisos.sql` · `src/services/omie-emails.service.js` ·
`src/services/cobranca-avisos.service.js` · `src/jobs/cobranca-avisos.job.js` ·
`src/services/omie-receber.service.js` (a cópia dos a vencer) ·
`src/services/nota-fiscal.service.js` (o bloco Email) · `src/services/email.js`
(`montarCobranca`, `sendCobrancaCliente`) · `src/routes/cobranca.routes.js` ·
`src/services/config.service.js` (as chaves `cobranca.*`) ·
`public/admin-cobranca-avisos.js` · `public/admin-financeiro.js` (a troca
"Avisos") · `public/admin-cobranca.js` (os avisos no painel do título) ·
`public/admin.js` (o campo no modal da nota) · `public/admin.css` (bloco `ca-`).
