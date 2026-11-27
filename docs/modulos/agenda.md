---
tags:
  - projeto
  - fluxo
aliases:
  - Agenda
  - Agenda da empresa
  - Compromissos
  - Faturamento dos contratos do Omie
---
# Fluxo: agenda da empresa (🟡 fase A pronta, 18/11/2026 · concluir, "só esta" e a agenda do turno, 27/11/2026)

Pedido do Pedro: uma agenda "de verdade", que reúna tudo o que a empresa tem a
fazer, *"desde manutenções até pagamento de funcionários"*, mais o que vem do
Omie, como o faturamento das preventivas no começo do mês. Branch
`feature/admin-condominio`, sem deploy. O "porquê" das escolhas está em
[decisions.md](../../memory-bank/decisions.md) (seção "Agenda da empresa").

## O que entra na agenda

| Fonte | O quê | De onde vem | Quem vê |
|---|---|---|---|
| Compromisso | Reunião, visita, pagamento, financeiro, outro, com repetição semanal ou mensal | tabela `compromissos` (migration 092) | gestão; pagamento e financeiro só o **admin** |
| Retorno de O.S. | "Retorno pedido na OS-…" no dia sugerido pelo técnico | `ordens_servico.retorno_sugerido_em` (finalizada, `necessario_retorno`) | gestão |
| Contrato | "Contrato de X termina" no `fim_em` | `contratos` (ativos) | gestão |
| Preventivas | "Preventivas de novembro: N feitas, M a fazer", no dia 1 | `chamados` com `plano_manutencao_id` e `competencia` | gestão |
| Faturamento Omie | "Conferir e faturar os contratos: 77 de 81", no dia proposto do lote (`omie.faturamento_dia` ou o próximo dia útil, desde a 097; abre o lote: ver [omie-integracao.md](omie-integracao.md)) | cópia do Omie (`omie_contratos`, `omie_contrato_notas`) | só o **admin** |

**O operador tem a agenda desde 27/11/2026, só com as visitas** (pedido do
Pedro: "pode ter acesso a essa agenda mas só com as visitas" … "e chamados").
A rota `/agenda` deixa o `operador` entrar e devolve para ele só a visita
ligada a chamado e o retorno de O.S.; reunião, pagamento, contrato,
preventivas e Omie não chegam. A tela dele é própria, no painel do turno:
`/operador/painel/agenda` (`operador-agenda.js`), ver
[Agenda do turno](#agenda-do-turno-operador-27112026). Antes disso ele só via o
dia de hoje no trilho ("Hoje na agenda", que continua, agora com o link "Ver a
semana"). Ver
[painel-operador.md](painel-operador.md#o-escritório-e-o-turno-20112026-migration-098).

## Telas

`#/agenda`, primeira subaba do grupo **Agenda** (Agenda · Mapa · Preventivas).
Arquivo `public/admin-agenda.js`, no molde do `admin-condominio.js`.

- **Semana** (padrão no desktop), **Mês** e **Lista** (padrão no celular: 30
  dias agrupados por dia). Cada tipo tem uma cor, no fio à esquerda do item.
- **Novo compromisso**: botão da barra, "+" de cada dia na semana ou clique no
  espaço do dia no mês. Pagamento e Financeiro só aparecem no tipo para o admin.
- Clique no item: desde 27/11/2026 abre o **cartão** (ver "Concluir e mexer
  numa vez só" abaixo), que tem o "Abrir": retorno abre a O.S.; contrato abre
  a ficha do condomínio na aba Contrato; preventivas abrem a tela Preventivas;
  faturamento abre o painel do mês; visita de chamado abre o chamado.
- **Painel do faturamento**: "77 de 81 contratos ativos com nota no mês", valor
  faturado de valor esperado, a lista dos contratos sem nota com o motivo
  provável ("vigência acabou e o contrato continua ativo no Omie") e o botão
  "Atualizar agora".

## Concluir e mexer numa vez só (27/11/2026, migration 111)

Pedido do Pedro: *"a agenda precisa de melhorias, hoje não dá para editar as
coisas, não dá para marcar que foi feito, veja como agendas profissionais
fazem pra gente copiar"*. Copiado do Google Agenda (o alcance da mudança numa
série) e do Jobber (o círculo de feito na visita). Maquete aprovada:
`public/_agenda-preview.html` (`/dev/_agenda-preview.html`).

- **Círculo de feito em todo item** (compromisso, retorno de O.S., contrato
  terminando). Feito fica cinza, riscado, com ✓ verde; o aviso traz
  "Desfazer". Num compromisso que repete, vale **só aquela vez**. O
  faturamento do Omie conclui sozinho (círculo tracejado); o resumo das
  preventivas não tem círculo (é contagem).
- **A visita de chamado se marca sozinha** quando a O.S. daquele chamado é
  finalizada no mesmo dia (`concluido_auto`, "Feito pela OS-…"). Visita de
  chamado já fechado/cancelado também conta como feita. Marcar a visita feita
  **não fecha o chamado**: ele continua aberto até a O.S.
- **Clicar no item abre um cartão** (no lugar do menu do Quadro e do "abrir
  direto" das outras vistas): dia, hora, repetição, prédio, quem, observação,
  quem fez e quando; botões Marcar como feito/Reabrir · Editar · Remarcar ·
  Abrir (chamado, O.S., contrato, Preventivas, faturamento) · Apagar.
- **"Só esta / esta e as próximas / todas"** ao editar, remarcar, mover
  (arrastar) ou apagar um compromisso que repete. "Só esta" grava uma exceção
  (`POST …/ocorrencia`); "esta e as próximas" corta a série na véspera e cria
  outra (`POST …/dividir`); "todas" é o `PATCH` de sempre. Compromisso que
  repete agora arrasta no Quadro (antes não).
- **Atrasado:** o que passou do dia sem ser feito ganha fio vermelho e a
  etiqueta ATRASADO, e entra na aba **Atrasados** do Quadro e no bloco
  **"Passou da data"** da Lista (últimos 30 dias). Nada some sozinho.
  ⚠️ **Reunião não fica atrasada**: reunião que passou aconteceu (é evento,
  não tarefa, como no Google). Sem isso a reunião semanal enchia a aba toda
  segunda.
- **Criar rápido:** clicar no espaço vazio de um dia (Semana, Mês) ou de uma
  célula do Quadro abre um formulário curto (título, tipo, hora); na linha de
  um técnico ele já vem como responsável. "Mais opções" abre o formulário
  completo com o que foi digitado.
- **Semana, Mês e Lista foram redesenhadas** no molde do Quadro (o mesmo
  cabeçalho com as quatro vistas). Semana: sete colunas com o item do Quadro e
  o nome de quem vai. Mês: item pequeno sem círculo (feito riscado com ✓,
  atrasado com fio), "2/3 feitos" nos dias que passaram. Lista (a do celular):
  uma linha por item com o círculo grande, "Hoje · 1 de 3 feitos".
- Cada técnico no Quadro mostra "N de M feitas na semana".

Código: `admin-agenda.js` (as vistas, o cartão, o alcance, o feito, o criar
rápido) e `admin-despacho.js` (o Quadro, que usa as peças do outro);
`admin.css`, bloco "AGENDA — CONCLUIR E MEXER NUMA VEZ SÓ".

## Agenda do turno (operador, 27/11/2026)

`/operador/painel/agenda` — `operador-agenda.html` + `operador-agenda.js`,
bloco `.oa-*` do `operador.css`. Link "Agenda" na barra das quatro telas do
operador e "Ver a semana" embaixo do "Hoje na agenda" do trilho do Turno.

- ⚠️ **AGENDA-SE NO TURNO, NÃO AQUI** (27/11/2026, mesmo dia). O Pedro olhou
  a primeira versão e apontou a redundância: o operador abria o chamado no
  Turno e depois vinha à Agenda para marcar o dia. Quem vai e quando é UMA
  decisão. Agora o **"Despachar"** e o **"Novo chamado"** do Turno perguntam
  **Quando: Agora / Outro dia**; "Outro dia" atribui o técnico e já cria a
  visita (`POST /agenda/compromissos`). O item da fila mostra a visita
  ("Marina · visita amanhã às 08:00"), porque `GET /operador/fila` traz
  `visita` de cada chamado. A Agenda do turno fica para **ver a semana e
  ajustar** (remarcar, feito, desmarcar).
- **No computador:** técnicos nas linhas, dias da semana nas colunas, e uma
  linha "Sem técnico" (retornos de O.S. e visita sem técnico). À esquerda, a
  fila: **Esperando alguém** (rede de segurança: chamados sem técnico e sem
  nenhuma visita, nem atrasada — o mesmo nome do Turno) e **Atrasados**. Arrastar o chamado para um técnico e um dia agenda a visita
  e atribui o técnico ao chamado; arrastar a visita remarca (e troca o
  técnico do chamado); soltar a visita na fila desmarca. Tudo com Desfazer.
- **No celular** (menos de 900px): lista com "Passou da data", "Esperando
  alguém" (com o botão "Agendar") e um bloco por dia.
- Círculo de feito, cartão (Marcar como feito · Remarcar · Desmarcar),
  formulário curto (técnico, dia, hora) e Ajuda.
- Visita que repete: o operador mexe **só nesta vez** (não há a pergunta do
  alcance aqui; visita de chamado quase nunca repete).
- Os dados: `GET /agenda` (filtrado para o operador) da semana e dos 30 dias
  anteriores, e `GET /operador/fila` (chamados e técnicos; desde hoje cada
  técnico traz `usuario_id`, para a visita cair na linha certa também pelo
  responsável, como no Quadro do admin). Atualiza a cada 60 s, sem atropelar
  cartão aberto nem arrasto.
- ⚠️ **Não importa nada do admin.** A regra das telas do operador continua:
  o que se repete com o admin é o contrato com a rota `/agenda`, não o código.

## Rotas (`/agenda`, gestão; operador só nas visitas)

| Rota | O quê |
|---|---|
| `GET /agenda?de=AAAA-MM-DD&ate=AAAA-MM-DD` | tudo do período (até 100 dias), com as repetições expandidas e as exceções aplicadas; cada item traz `concluido` |
| `POST /agenda/compromissos` | cria. Pagamento/financeiro: só admin, nasce `so_admin`. Operador: só visita de chamado |
| `PATCH /agenda/compromissos/:id` | edita (parcial) — a série toda ("todas") |
| `DELETE /agenda/compromissos/:id` | marca `apagado_em` (a agenda é registro) |
| `POST /agenda/compromissos/:id/ocorrencia` | "só esta" e o feito (migration 111) |
| `POST /agenda/compromissos/:id/dividir` | "esta e as próximas" (com `apagar`, só corta) |
| `POST /agenda/feitos` | feito do retorno de O.S. e do contrato |
| `GET /agenda/faturamento?competencia=AAAA-MM` | retrato do faturamento do mês (admin) |
| `POST /agenda/faturamento/atualizar` | copia de novo do Omie (admin; respeita 2 min) |

## O Omie: só leitura

⚠️ **O sistema não emite as notas das preventivas.** Conferido pela API em
18/11/2026: elas saem pelo **faturamento de contratos do próprio Omie** (151
contratos cadastrados lá, 81 ativos, todos com faturamento no dia 1; 71 notas
emitidas no mesmo dia em 03/11). Emitir pelos dois lados daria nota em dobro.
A agenda **acompanha**.

- `src/services/omie-faturamento.service.js` lê `servicos/contrato`
  `ListarContratos` e `servicos/nfse` `ListarNFSEs` (filtro `dEmiInicial` /
  `dEmiFinal`, mês atual e anterior). A NFS-e de contrato traz
  `OrdemServico.nCodigoContrato`, que liga a nota ao contrato sem adivinhação.
- `src/jobs/omie-faturamento.job.js` atualiza a cópia de hora em hora
  (`omie.faturamento_intervalo_min`, 15 a 1440, editável em Configurações).
  Primeira volta 3 min após o boot. Sem `OMIE_APP_KEY` o job não roda.
- ⚠️ **"Consumo redundante"**: o Omie recusa a mesma consulta repetida em
  menos de ~1 min. Por isso a tela lê a cópia no banco, nunca a API direto.
- "Esperado no mês" = contrato com situação `10` no Omie. Os significados de
  `90`, `99` e `00` não foram confirmados (pela contagem parecem suspenso,
  encerrado e em elaboração).

**Achado do levantamento:** os 4 contratos ativos sem nota em novembro
(2024/00072, 00080, 00088, 00105) têm vigência vencida desde 2025. Ou
acabaram e continuam "ativos" no Omie, ou foram renovados sem registro.

## ⚠️ Armadilhas

- **Fuso.** O servidor é UTC e a empresa é São Paulo (-03:00 fixo desde 2019).
  A repetição é expandida no relógio de SP; sem isso uma reunião das 22h30
  pularia para o dia seguinte. Coberto no teste.
- **Compromisso que repete é uma linha só.** Editado a partir de uma ocorrência
  (a de dezembro de uma série que começou em novembro), o formulário mantém o
  início da série se o dia não mudou (`serie_inicio`). Sem isso a série inteira
  mudava de mês.
- **Dia 31 em mês curto** cai no último dia (28/02, 30/04).
- **O formulário não espera a equipe** (23/11/2026). Com `await` no
  `GET /admin/usuarios` antes de abrir, o menu do quadro fechava e nada surgia
  por um ou dois segundos: parecia que "Editar" não funcionava. A equipe é
  buscada ao entrar na Agenda; o select do responsável completa depois.
- **No Quadro, todo compromisso tem Apagar** (23/11/2026). Série: "Apagar a
  série", com confirmação, e o Desfazer recria desde o `serie_inicio`. Visita
  de chamado avulsa continua com "Desmarcar" (o chamado volta para "a agendar").
- **Só vale a resposta do último pedido** na tela (`_agSeq`): trocar Semana →
  Mês rápido deixava a resposta da semana sobrescrever o mês.
- **As consultas da rota saem em paralelo.** Em sequência um mês levava 5 s no
  banco de teste; em paralelo, 0,7 s.
- **A exceção é presa ao início ORIGINAL da vez** (`ocorrencia_em`, migration
  111). Se o início da série muda ("todas"), a rota anda as chaves junto —
  senão o feito de ontem se soltaria da visita. Anda certo quando a distância
  é a mesma para todas as vezes (não repete, semanal, ou só a hora mudou);
  série mensal que troca de dia fica com as exceções antigas soltas.
- **A vez remarcada para fora do período ainda é achada.** A rota expande as
  vezes numa janela de 62 dias antes e depois do período e só então vê onde
  cada uma caiu. Sem isso a vez trazida de outra semana sumia.
- **A âncora do pop pode ter saído da tela** (27/11/2026). Marcar um feito, ou
  a atualização periódica do Atendimento, redesenha o Quadro; o cartão que
  abria "Remarcar" apontava para o item velho e o pop caía no canto (0,0).
  `_agAncora` procura o item novo pelo id.
- **O rádio nativo saía preto** no pop do alcance: o painel declara
  `color-scheme: dark`. O `.dq-pop` fixa `color-scheme: light`.

## Testado (banco de teste, 18/11/2026)

`node scripts/testes/agenda.test.js`: **21/21** — criar, pagamento só do admin
e invisível ao gerente, mensal no dia 31, semanal com fim, fuso de SP, editar,
apagar, validação, operador 403, faturamento só admin. Na tela: semana, mês e
lista (desktop e celular 375px), formulário criando e editando ocorrência de
série, painel do faturamento com os dados reais copiados do Omie.

⚠️ Ficaram no banco de teste 5 compromissos "[exemplo]" para olhar a tela.

**27/11/2026 (migration 111):** `node scripts/testes/agenda.test.js`:
**49/49** — além dos 21 de antes (o "operador recebe 403" virou "operador lê
só as visitas"): operador marca visita de chamado e não cria reunião, não vê
reunião/pagamento/contrato/preventivas/Omie, não alcança compromisso sem
chamado, não tira o chamado da visita; feito só numa vez da série; vez que não
existe dá 400; "só esta" remarca e apaga uma vez; a vez remarcada aparece no
dia novo; "todas" muda a hora e o feito continua; reabrir; "esta e as
próximas" divide sem dobrar e leva o feito junto; apagar daqui para frente;
feito do retorno e o operador sem contrato. Na tela (banco de teste, painel
novo): Quadro com feito, cartão, "só esta" remarcando, Semana, Mês e Lista no
celular; no operador: agendar pelo formulário, Desfazer, feito, arrastar
(agendar, mover, desmarcar na fila) e a lista no celular; a barra das telas
do operador com o link novo cabe em 375px. Mais 5 compromissos "[exemplo]" no
banco de teste (reunião semanal, pagamento mensal, duas visitas, um lembrete).

## Próximas fases

| Fase | O quê | Depende de |
|---|---|---|
| B | Dia e técnico marcados na preventiva e no chamado; técnico vê a semana no app (a decidir) | migration + APK |
| C | Contas a pagar e a receber do Omie na agenda | pagamento de funcionário não está no Omie hoje; contas sim |
| D | ~~Notas das preventivas em lote~~ | **descartada**: o Omie já fatura os contratos |

Ver também: [redesenho-admin.md](redesenho-admin.md) ·
[nota-fiscal.md](nota-fiscal.md) · [banco-de-dados.md](../banco-de-dados.md) ·
[Home](../../Home.md)
