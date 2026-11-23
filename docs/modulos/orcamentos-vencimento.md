---
tags:
  - projeto
  - fluxo
aliases:
  - Orçamento vencido
  - Orçamentos arquivados
  - Lembrete de orçamento
---
# Fluxo: o orçamento que vence (23/11/2026)

Pedido do Pedro em 23/11/2026, olhando a tela de Orçamentos com **126 "pede
ação"**: 111 deles eram orçamentos **enviados cuja validade passou sem
resposta** (validades de 04/07 a 20/11/2026). Três pedidos:

1. Arquivar já todos os vencidos.
2. Daqui para a frente, o vencido se arquiva sozinho, e **depois de um tempo é
   apagado**.
3. **5 dias antes de vencer**, um e-mail perguntando ao cliente sobre a
   aprovação, **para os mesmos e-mails para os quais o orçamento foi enviado**.

Migration **103** (✅ produção, 23/11/2026: os 111 vencidos foram arquivados
no mesmo dia). Código: `src/services/orcamento-vencimento.service.js`,
`src/jobs/orcamento-vencimento.job.js`, `sendOrcamentoLembrete` em
`src/services/email.js`. Teste: `scripts/testes/orcamento-vencimento.test.js`.

## O que é "vencido"

`status = 'enviado'`, `respondido_em` nulo e `valido_ate` **antes de hoje** no
dia de São Paulo. Rascunho, aprovado, recusado e o que o cliente respondeu
nunca entram. Sem validade, não vence.

## 1. Arquivar

`orcamentos.arquivado_em` (e `arquivado_por`, nulo quando foi o job).

⚠️ **O status continua `enviado`, de propósito.** A tela do cliente, a resposta
pelo painel (`POST /cliente/orcamentos/:id/responder` só aceita `enviado`) e os
relatórios leem status. Arquivar é estado da **lista do escritório**, não do
documento: o síndico que resolve aprovar um orçamento vencido continua podendo
aprovar, e a aprovação aparece normalmente (o filtro de arquivado exige
`respondido_em` nulo).

Na tela (`public/admin-orc-lista.js`): o arquivado tem selo **Arquivado**, sai
de "Pede ação" e de "Esperando o cliente" e vai para a visão **Arquivados**
(que só aparece quando há algum). O andamento da ficha diz quando foi
arquivado e como reabrir.

**Como volta:** dando uma validade nova.

- `PATCH /admin/orcamentos/avulsos/:id` e `PATCH /admin/orcamentos/:os_id`
  (`acao: salvar`) com `valido_ate` **hoje ou no futuro**, ou vazio (sem
  validade), limpam `arquivado_em`. Validade ainda no passado não mexe — o job
  arquivaria de novo.
- O reenvio (`POST /admin/orcamentos/avulsos/:id/enviar-email`) desarquiva só
  se a validade estiver em dia: reenviar documento vencido não reabre nada.

⚠️ **O desarquivar usa o mesmo parâmetro da validade duas vezes** (valor da
coluna e comparação no `CASE`) — é exatamente o formato do 42P08 do
[`CLAUDE.md`](../../CLAUDE.md). Por isso `::date` em todos os usos
(`_DESARQUIVA` em `src/routes/admin.routes.js`), e o teste bate nas duas rotas.

## 2. Apagar

Arquivado há mais de **`orcamento.apagar_dias`** dias (Configurações) é
apagado pelo job. **Padrão: 90 dias** (decisão do Pedro, 23/11/2026); `0` =
não apaga. Os 111 arquivados em 23/11/2026 entram na conta a partir de
**21/02/2027**.

Segue o molde da [lixeira](../banco-de-dados.md) (migration 089): o `DELETE`
passa pelo trigger e deixa a linha inteira (e os itens) em
`registros_apagados`, com `contexto` = *"orçamento vencido, arquivado há mais
de N dias (job orcamento-vencimento)"*. Recuperar é o mesmo `INSERT … SELECT
jsonb_populate_record` da seção "Lixeira" do banco.

Ficam de fora, mesmo vencidos e arquivados: o que tem **chamado** ligado
(`chamados.orcamento_id`), **movimentação de equipamento** ligada, **nota**
(`nota_status`) ou **resposta** do cliente.

⚠️ **O pedido do técnico sai da fila junto.** Quando o orçamento nasceu de uma
O.S. (`os_id`), apagar só o documento faria a O.S. voltar à lista como
"Pedido do técnico" (a flag `orcamento_necessario` continua ligada), e alguém
faria outro orçamento. O job desliga a flag — a mesma regra do
`DELETE /admin/orcamentos/:os_id` — se nenhum outro orçamento daquela O.S.
continuar existindo.

## 3. Lembrete antes de vencer

`orcamento.lembrete_dias` (padrão **5**; 0 = não manda) antes de `valido_ate`.

- **Para quem:** `orcamentos.enviado_para`, os endereços que o envio gravou.
  Orçamento sem `enviado_para` (marcado como enviado à mão, ou anterior à 047)
  fica `sem_email` e não recebe — em 23/11/2026 eram 54 dos 111 vencidos.
- **Uma vez só:** `orcamento_lembretes` tem `UNIQUE (orcamento_id,
  valido_ate)`. Quem estende a validade ganha um lembrete novo, para a nova
  data. A linha nasce `enviando` (é a trava contra duas voltas ao mesmo
  tempo) e termina `enviado`, `erro` ou `sem_email`. Erro é tentado de novo
  na volta seguinte, até **3 tentativas**.
- **Janela:** sai quando faltam de 1 a N dias. Se o 5º dia cair no fim de
  semana, sai na segunda (com 3 dias). Não sai para orçamento **enviado há
  menos de 2 dias**: validade curta não pode render um "vai vencer" logo
  atrás do envio.
- **Quando:** só em dia útil, 8h–18h de São Paulo (`_horarioComercial` do job
  de cobrança).
- ⚠️ **Exige `ORCAMENTO_LEMBRETE_EMAIL=1` no servidor.** O banco de teste tem
  e-mails de cliente de verdade, e sem a trava um `npm run dev` escreveria
  para eles. Mesmo molde do `COBRANCA_EMAIL`. **Em produção a variável
  precisa ser criada no Railway**, senão o lembrete nunca sai (o arquivar e o
  apagar não dependem dela).
- **O e-mail:** moldura estruturada (a mesma do envio e da O.S.), sobrancelha
  "Orçamento perto de vencer", assunto *"Orçamento OR-… vence em dd/mm —
  podemos seguir?"*. Sem valor no corpo (regra da moldura) e **sem anexo**: o
  documento já foi no primeiro e-mail. Leva o botão "Ver o orçamento e
  responder" **só** quando algum destinatário tem login no painel daquele
  prédio (a mesma regra do envio: botão que leva a um login onde ninguém
  entra é pior que nenhum) e `APP_URL`/`PUBLIC_BASE_URL` existe. `replyTo` é o
  comercial: quem responde o e-mail cai lá.

A ficha mostra "Lembrete ao cliente" no andamento, e a linha diz
"lembrete dd/mm" (`lembrete_em` em `GET /admin/orcamentos/avulsos`).

## O job

`src/jobs/orcamento-vencimento.job.js`, `setTimeout` recursivo, a cada
`orcamento.vencimento_intervalo_min` (padrão 60). Primeira volta 5 min depois
do boot. Cada volta: arquiva → apaga (se o prazo for > 0) → lembretes (se for
horário comercial). Sem a migration 103, loga o erro e não derruba nada.

Para arquivar **agora**, mostrando a contagem antes:
`node scripts/orcamentos-vencidos.js --prod` (só conta) e `--prod --gravar`.

## Configurações

| Chave | Padrão | |
|---|---|---|
| `orcamento.lembrete_dias` | 5 | 0 = não manda |
| `orcamento.apagar_dias` | 90 | 0 = não apaga |
| `orcamento.vencimento_intervalo_min` | 60 | 10–1440 |

---

Relacionados: [orcamentos-envio.md](orcamentos-envio.md) ·
[cobranca-avisos.md](cobranca-avisos.md) ·
[../banco-de-dados.md](../banco-de-dados.md) · [../api.md](../api.md)
