---
tags:
  - projeto
  - fluxo
aliases:
  - Dashboard de Relatórios
  - Relatórios (dashboard)
  - GET /relatorios/dashboard
---
# Fluxo: o dashboard de Relatórios (20/11/2026)

Pedido do Pedro: trocar a tela de exportar relatórios por um **dashboard**.
A maquete (`/dev/_redesenho-preview.html#/relatorios`) foi aprovada no mesmo
dia. As respostas que guiaram o desenho estão em
[redesenho-admin.md](redesenho-admin.md#relatórios-vira-dashboard-maquete-20112026).

| Pergunta | Resposta do Pedro |
|---|---|
| Quem olha | Ele, toda semana ou mês (visão de gestão; o dia a dia é o Hoje) |
| Período ao abrir | Mês corrente contra o anterior; troca para mês passado, trimestre e 12 meses |
| O que responde | Atendimento e prazo, dinheiro, técnicos, prédios e equipamentos |
| Exportar | Sai de Relatórios: cada lista tem o seu "Exportar" |

## Peças

| Peça | O que faz |
|---|---|
| `GET /relatorios/dashboard?periodo=mes\|ant\|tri\|ano` | `src/routes/relatorios.routes.js`. Devolve os números do período e do anterior, a série de 12 meses e as listas. `gestaoOnly` (admin e gerente) |
| `public/admin-relatorios.js` | a tela, na seção `relatorios` do painel novo (`#relDash`). Gráficos em SVG na própria página |
| `public/admin.css` | bloco "RELATÓRIOS — dashboard de gestão", prefixo `rd-` (o `rel-` é da tela antiga) |
| `scripts/testes/relatorios-dashboard.test.js` | rota de verdade contra o banco de teste (25 checagens) |

A tela antiga (painel ao vivo + exportar CSV) **continua só no painel de
antes** (`public/legado/`, ver [painel-novo.md](painel-novo.md)). No painel novo
a seção foi trocada pelo dashboard; o `renderRelatorios` do `admin.js` só roda
onde o `#relDash` não existe. As rotas antigas (`/relatorios/chamados`,
`/alertas`, `/telemetria`, `/painel-vivo`) seguem vivas para o painel de antes.

## O período

`periodoDashboard()` devolve `[ini, fim)` do período e do anterior, em datas de
São Paulo.

⚠️ **Período em curso compara com o mesmo pedaço do anterior.** Em 20/11,
"Este mês" é 1 a 20 de novembro, e o anterior é **1 a 20 de outubro**, não
outubro inteiro. Comparar o mês pela metade com o mês cheio faria todo começo
de mês mostrar tudo "caindo". O mesmo vale para trimestre e 12 meses.

A série dos gráficos é sempre de 12 meses, terminando no último mês do período.

## As réguas

| Número | Régua | Por quê |
|---|---|---|
| Chamados abertos | corretivos (sem `plano_manutencao_id`), não cancelados, por `criado_em` | preventiva tem número próprio; cancelado não foi demanda (a virada do mês cancela preventiva não começada) |
| Tempo até atender | **mediana** de `criado_em` até a chegada (`tecnico_chegou_em`, ou a `chegada_em` da O.S. quando a primeira falta) | mediana porque um chamado esquecido de semanas puxaria a média para longe do normal |
| Dentro do prazo | chegada até `criado_em + sla_definicoes.sla_chegada_min` | é o prazo da cláusula 7 (chegada, não resolução: ver [chamados-sla.md](chamados-sla.md)) |
| (prazo) quem conta | só os "decididos": o técnico chegou, ou o prazo venceu sem ninguém e o chamado **não** foi fechado | chamado fechado sem visita foi resolvido por telefone; P4 não tem prazo de chegada |
| Faturado | notas de contrato (`omie_contrato_notas`, por `emitida_em`, sem as canceladas) + notas de orçamento emitidas pelo sistema (`orcamentos.nota_emitida_em`) | nota emitida direto no Omie, fora do sistema, não entra na parte de O.S. |
| Orçamentos aprovados | dos enviados no período (`enviado_em`), quantos têm `aprovado_em` | taxa de conversão do que foi de fato mandado ao cliente |
| Preventivas feitas | cada par (plano, mês) com chamado da competência ou baixa à mão; feita = chamado fechado ou baixa | a mesma régua da tira dos 12 meses (`GET /planos-manutencao/meses`) |
| Em campo | soma de `chegada_em` até `finalizada_em` das O.S. finalizadas no período (descarta acima de 24 h) | O.S. esquecida aberta de um dia para outro não é trabalho |
| Retrabalho | chamado corretivo aberto até **30 dias** depois de outro fechado no **mesmo equipamento**; sem equipamento ligado, no mesmo prédio e mesma categoria. Conta para o técnico do chamado **anterior** | o serviço que não segurou é o de quem atendeu antes |
| Equipamentos que mais quebram | chamados corretivos com `equipamento_id`, agrupados por tipo + marca + modelo | a tela avisa quantos chamados do período não têm equipamento ligado e ficam fora |
| Reservatórios com mais alertas | `alertas` do período ligados ao reservatório pelo `device_id`, com o tipo mais comum | |
| Falta faturar | orçamentos `aprovado` sem `nota_status`, e notas com erro | mesma régua do "Pede ação" do Financeiro. **Não é contas a receber**: isso ainda não existe no sistema (roadmap) |

⚠️ **O dinheiro só vai para o admin.** Para o gerente a rota não devolve
faturamento, série de dinheiro nem "falta faturar", e a tela mostra cinco
números e três blocos. Mesma regra do faturamento no Financeiro.

## Cuidados

- `$1`/`$2` são usados como data e como hora de São Paulo na mesma consulta:
  todo uso tem `::date` explícito (o 42P08 do CLAUDE.md).
- Quando a consulta junta `cor` (os chamados) com `condominios`, a marca de
  fora do prazo é calculada **antes** da junção: as duas têm `criado_em`, e a
  expressão sem prefixo dava "column reference is ambiguous".
- No celular, a regra global `table { min-width: 520px }` do `admin.css`
  empurrava a tabela dos técnicos para fora; o `.rd .rd-tb` anula.

## Testado (banco de teste, 20/11/2026)

`node scripts/testes/relatorios-dashboard.test.js` — 25/25: os quatro períodos
respondem com a série de 12 meses no lugar certo, período inválido dá 400,
operador dá 403, gerente entra sem o dinheiro; e um caso montado prova as
réguas: dois corretivos contam e a preventiva não, o P1 sem chegada depois do
prazo entra em fora do prazo, o chamado que volta no mesmo equipamento conta
como retrabalho do técnico anterior, a preventiva fechada conta como feita.
Na tela: painel novo em 1900 px e 390 px, troca para 12 meses, sem erro no
console e sem rolagem lateral.
