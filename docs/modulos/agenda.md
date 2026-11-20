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
# Fluxo: agenda da empresa (🟡 fase A pronta, 18/11/2026)

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

O operador não tem a agenda (a rota é `gestaoOnly`; o item some do menu dele).
Desde 20/11/2026 ele **vê o dia de hoje** no painel do turno ("Hoje na
agenda", no trilho), pelo `GET /operador/fila`: compromissos que não são só do
admin e os retornos de O.S. Ver
[painel-operador.md](painel-operador.md#o-escritório-e-o-turno-20112026-migration-098).

## Telas

`#/agenda`, primeira subaba do grupo **Agenda** (Agenda · Mapa · Preventivas).
Arquivo `public/admin-agenda.js`, no molde do `admin-condominio.js`.

- **Semana** (padrão no desktop), **Mês** e **Lista** (padrão no celular: 30
  dias agrupados por dia). Cada tipo tem uma cor, no fio à esquerda do item.
- **Novo compromisso**: botão da barra, "+" de cada dia na semana ou clique no
  espaço do dia no mês. Pagamento e Financeiro só aparecem no tipo para o admin.
- Clique no item: compromisso abre o formulário (editar, apagar); retorno abre a
  O.S.; contrato abre a ficha do condomínio na aba Contrato; preventivas abrem a
  tela Preventivas; faturamento abre o painel do mês.
- **Painel do faturamento**: "77 de 81 contratos ativos com nota no mês", valor
  faturado de valor esperado, a lista dos contratos sem nota com o motivo
  provável ("vigência acabou e o contrato continua ativo no Omie") e o botão
  "Atualizar agora".

## Rotas (`/agenda`, gestão)

| Rota | O quê |
|---|---|
| `GET /agenda?de=AAAA-MM-DD&ate=AAAA-MM-DD` | tudo do período (até 100 dias), com as repetições expandidas |
| `POST /agenda/compromissos` | cria. Pagamento/financeiro: só admin, nasce `so_admin` |
| `PATCH /agenda/compromissos/:id` | edita (parcial) |
| `DELETE /agenda/compromissos/:id` | marca `apagado_em` (a agenda é registro) |
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
- **Só vale a resposta do último pedido** na tela (`_agSeq`): trocar Semana →
  Mês rápido deixava a resposta da semana sobrescrever o mês.
- **As consultas da rota saem em paralelo.** Em sequência um mês levava 5 s no
  banco de teste; em paralelo, 0,7 s.

## Testado (banco de teste, 18/11/2026)

`node scripts/testes/agenda.test.js`: **21/21** — criar, pagamento só do admin
e invisível ao gerente, mensal no dia 31, semanal com fim, fuso de SP, editar,
apagar, validação, operador 403, faturamento só admin. Na tela: semana, mês e
lista (desktop e celular 375px), formulário criando e editando ocorrência de
série, painel do faturamento com os dados reais copiados do Omie.

⚠️ Ficaram no banco de teste 5 compromissos "[exemplo]" para olhar a tela.

## Próximas fases

| Fase | O quê | Depende de |
|---|---|---|
| B | Dia e técnico marcados na preventiva e no chamado; técnico vê a semana no app (a decidir) | migration + APK |
| C | Contas a pagar e a receber do Omie na agenda | pagamento de funcionário não está no Omie hoje; contas sim |
| D | ~~Notas das preventivas em lote~~ | **descartada**: o Omie já fatura os contratos |

Ver também: [redesenho-admin.md](redesenho-admin.md) ·
[nota-fiscal.md](nota-fiscal.md) · [banco-de-dados.md](../banco-de-dados.md) ·
[Home](../../Home.md)
