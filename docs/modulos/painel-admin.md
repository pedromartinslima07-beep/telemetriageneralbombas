---
tags:
  - projeto
  - fluxo
aliases:
  - Painel Admin
  - Mission Control
  - Painel de operação
  - Admin
---
# Painel admin (`/admin/painel`)

A superfície interna de operação: quem olha N condomínios ao mesmo tempo. Serve
as roles **admin**, **gerente** e **operador** (divisão em
[`autenticacao.md`](autenticacao.md)). É uma SPA de arquivo único —
`public/admin.html` (147 KB), `public/admin.js`, `public/admin.css` (8.273
linhas) — sem build e sem framework, servida pelo Express.

Não confundir com o [painel do cliente](painel-cliente.md), que é outra folha,
outro público e outro sistema visual.

---

## As 15 telas

Não há rota por tela: tudo é `showSection(nome)` alternando `.section` no mesmo
documento. Os nomes abaixo são os `data-section` reais.

| Grupo na nav | Seções |
|---|---|
| **Monitor** | `dashboard` · `telemetria` · `mapa` · `alertas` |
| **Atendimento** | `chamados` · `ordens-servico` · `orcamentos` · `contratos` · `planos` · `whatsapp` |
| **Gestão** | `cadastros` (Clientes) · `tecnicos` (Colaboradores) · `equipamentos` · `relatorios` · `config` |

Mais **10 overlays de modal**, **1 gaveta** (`drawer-panel`, por condomínio,
aberta a partir do dashboard) e **6 colunas de ficha** (`ch-detail-col`).

⚠️ `whatsapp` existe como seção mas **não aparece na nav** do painel em
execução — o item "Atendimento" da nav é o rótulo do grupo, não da seção.

## Os três moldes

Perfilando o markup, as 15 telas caem em três esqueletos. Isso é o fato mais
útil deste documento: **9 telas são a mesma tela**.

| Molde | Telas | Esqueleto |
|---|---|---|
| **A · Lista → ficha** | alertas, cadastros, chamados, ordens-servico, orcamentos, contratos, tecnicos, equipamentos, planos — **9** | faixa de KPI → barra (abas + busca + ação) → tabela → coluna de ficha |
| **B · Superfície viva** | dashboard, mapa, telemetria, whatsapp — **4** | mapa/gráfico/conversa ocupa a área, controles pousam por cima |
| **C · Formulário** | relatorios, config — **2** | campos agrupados + ação |

## O vocabulário está com o nome errado

`admin.css` tem **22 prefixos de classe próprios** — `tel-` (169 seletores),
`ch-` (119), `mp-` (116), `av-` (107), `al-` (104), `wa-` (83), `mc-` (83),
`os-` (68), `rel-` (57), `orc-`, `cfg-`, `pm-`, `edit-`, `cc-`, `rc-`, `tec-`,
`sla-`, `ctr-`, `dp-`, `wz-`, `nav-`, `tank-`.

Só que o vocabulário compartilhado **já existe**, batizado com o nome da tela
que nasceu primeiro:

- `.wa-tabs` / `.wa-tab` / `.wa-count` — nome de *WhatsApp* — usado em **10 das
  15 seções**.
- `.ch-layout` / `.ch-detail-col` / `.ch-toolbar` — nome de *Chamados* — usado
  em **6**.

Ao mexer aqui, saiba que renomear um desses quebra várias telas de uma vez.

---

## Defeitos medidos (18/08/2026)

Levantados percorrendo o painel em execução contra o banco de teste, não lendo
o código. Ficam registrados porque são a base da direção proposta abaixo.

**A faixa de KPI domina 10 das 15 telas.**

| Tela | KPIs | Altura antes do conteúdo | Linhas visíveis |
|---|---|---|---|
| `chamados` | **6, em 2 fileiras** | **~330px** | **5** |
| `telemetria` | 5 | ~140px | 1 reservatório |
| `dashboard` · `alertas` · `cadastros` | 5 | ~120px | 7 |
| `mapa` · `ordens-servico` · `contratos` · `planos` · `orcamentos` | 4 | ~120px | 0 a 5 |
| `tecnicos` · `equipamentos` · `relatorios` · `config` · `whatsapp` | 0 | — | — |

`ordens-servico` gasta 4 cards para 1 registro; `contratos` mostra 4 cards com
`0 · 0 · 0 · R$ 0,00` sobre uma tabela vazia. ⚠️ As duas telas **mais novas**
(`equipamentos`, `tecnicos`) não têm faixa e são as mais limpas do painel — o
padrão já está sendo abandonado na prática.

**O mesmo rótulo significa coisas diferentes.** `dashboard` diz `OFFLINE 4`
(dispositivos), `mapa` diz `OFFLINE 1` (condomínios). `telemetria` diz
`ALERTAS CRÍTICOS 8`, `alertas` diz `CRÍTICOS 7`, `mapa` diz `CRÍTICO 0`.
Não é bug — são unidades diferentes, e **nenhum rótulo declara a unidade**.

**A coluna de ficha nasce vazia ocupando ~28% da largura**, preenchida por
ícone-placeholder: chave de 160px em `tecnicos`, avatar de 130px em
`cadastros`, documento de 130px em `chamados`. `whatsapp` tem duas colunas
vazias mais a lista vazia.

**Seis vocabulários de estado para o mesmo conceito:** `P2 Alta` ·
`SLA ESTOURADO` · `Finalizada` · `AGUARDANDO ORÇAMENTO` · `ETIQUETA EM BRANCO`
(texto puro, sem pill) · `Disponível`.

**Colunas mortas:** `cadastros` tem `CNPJ` inteira em `—` e `CONTRATO` inteira
em `…`; `alertas` tem `AÇÕES` com um único ícone.

**`relatorios` tem uma barra âmbar de 4px na borda esquerda** do "Painel ao
vivo" — único lugar do painel com isso, e é o padrão que o
[`DESIGN.md`](../../DESIGN.md) proíbe por escrito.

**`planos` é a melhor tabela do painel e ninguém copiou:** agrupa por zona e
técnico, mostra data absoluta **e** relativa (`23/01/2027 · em 158 dias`,
`vencido há 2 dias` em vermelho) e tem seleção em lote.

---

## Direção proposta (não implementada)

Registrada aqui porque é o que orienta qualquer mexida futura. O "porquê", as
direções descartadas e o contrato de mundo visual estão em
[`../../memory-bank/decisions.md`](../../memory-bank/decisions.md).

Vestir o painel com o sistema **"Chapa"** da [landing](landing-publica.md) e do
[painel do cliente](painel-cliente.md), em registro de operação — mantendo
densidade, que é a função desta superfície.

1. **A faixa vira uma linha** — de 120–330px para ~56px.
2. **A ficha só existe quando há ficha** — a coluna colapsa a zero e abre na
   seleção.
3. **Um selo de estado** — placa chanfrada, preenchida quando pede ação, de fio
   em repouso; tinta da família `-t` sobre placa clara.
4. **O rótulo declara a unidade** — `OFFLINE · dispositivos`.
5. **`planos` vira o molde da tabela** — agrupamento, data relativa, lote.

Regra de superfície, tirada da tela de login que já está em produção:
**marinho é moldura; placa clara é onde se lê e se edita** (ficha, modal,
formulário).

**Ordem de execução:** pele (só tokens + `@font-face`) → faixa, selo e rótulo
(atingem 10 telas de uma vez) → ficha colapsável → tabela padrão.

⚠️ O risco está na consolidação do vocabulário, não na pele: 8.273 linhas e 22
prefixos, com `.wa-*` e `.ch-*` atravessando 10 e 6 telas. Renomear com alias
temporário (`.wa-tabs, .abas { … }`) é o que torna a mudança reversível.

---

Ver também: [`painel-cliente.md`](painel-cliente.md) ·
[`landing-publica.md`](landing-publica.md) ·
[`chamados-sla.md`](chamados-sla.md) · [`../arquitetura.md`](../arquitetura.md)
· [`../../CLAUDE.md`](../../CLAUDE.md) (cache em 3 camadas — obrigatório ao
mexer em `admin.css`).
