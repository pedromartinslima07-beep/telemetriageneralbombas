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
| **Agora** | `alertas` · `whatsapp` (Atendimento) · `chamados` |
| **Em curso** | `ordens-servico` · `orcamentos` |
| **Cadastro** | `cadastros` (Clientes) · `tecnicos` (Colaboradores) · `equipamentos` · `contratos` · `planos` |
| **Análise** | `dashboard` · `telemetria` · `mapa` · `relatorios` |
| **Sistema** | `config` |

> ⚠️ **O perfil `operador` vê cinco:** `alertas`, `chamados`, `telemetria`,
> `mapa` e `config` (só a aba "Conta"). Desde 27/08/2026 as outras dez não são
> apenas escondidas — as rotas delas respondem 403 pra ele. Lista e método de
> conferência em [`autenticacao.md`](autenticacao.md).

Os nomes dos grupos aparecem na sidebar aberta (mono, caixa alta) em quase
toda janela — só somem, virando um filete de 1px, quando a janela do
navegador tem menos de 700px de altura (notebook com barra de tarefas) ou
quando a sidebar está recolhida (ícones só, sem espaço pra letra). Em
qualquer um dos dois casos o texto continua no HTML — o `admin.js` varre
esses elementos pra esconder grupo órfão no perfil operador, e o leitor de
tela continua lendo. Esse perfil esvazia **dois** grupos inteiros hoje ("Em
curso" e "Cadastro"), então a varredura não é hipótese: sem ela sobram dois
cabeçalhos sem nenhum item embaixo.

⚠️ A densidade da sidebar tem **oito degraus de `@media (max-height)`**
(base, 1000, 940, 890, 850, 800, 750, 700), e a granularidade é
intencional: faixa larga obriga os valores a caber no pior viewport dela, e
foi o que já deixou o menu espremido com vão morto no pé. Ao mexer em altura
de item, padding da `.nav` ou margem do rótulo, **remeça a escada inteira** —
cada degrau é conferido no piso da própria faixa com o pior caso de 15 itens.
Motivo, tabelas e método no [changelog](../changelog.md) e em
[decisions.md](../../memory-bank/decisions.md).

Mais **10 overlays de modal**, **1 gaveta** (`drawer-panel`, por condomínio,
aberta a partir do dashboard) e **6 colunas de ficha** (`ch-detail-col`).

⚠️ `whatsapp` é o item **"Atendimento"** da nav e nasce `display: none` no
HTML — só aparece quando a integração está ligada. É por isso que a nav tem
dois tamanhos (14 ou 15 itens); o dimensionamento da sidebar sempre usa o pior
caso, 15.

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

## O desfecho do orçamento, vindo da tela do operador (31/08/2026)

A lista de orçamentos (`avulsos`) e a ficha passaram a mostrar **o que
aconteceu depois do "Aprovado"**:

| Selo na lista | Quando aparece |
|---|---|
| `FEITO`, verde de fio | alguém marcou à mão na tela do operador (`orcamentos.executado_em`) |
| `CHAMADO #N`, de fio | existe chamado ligado a este orçamento (`chamados.orcamento_id`) |

E na ficha, duas linhas logo depois de "Criado por": *Feito em … marcado por …*
e *Chamado #N · na fila do turno*. A ordem da ficha é a dos fatos — alguém
monta, o cliente responde, o escritório dá baixa, o serviço acontece.

⚠️ **É LEITURA PURA. `orcamentos.status` não muda.** Quem escreve o desfecho é
[o painel do operador](painel-operador.md); um controle aqui criaria dois
lugares para dizer a mesma coisa, e nenhum dos dois seria a verdade. E o
motivo de não existir um status `executado`: ele obrigaria a auditar todo
`WHERE status = 'aprovado'` do sistema — "executado" é fato do atendimento,
não estado do documento.

⚠️ **De fio, nunca preenchido** (Regra do Selo). Nesta lista o preenchimento é
de `.av-selo-pend` (resposta sem baixa), a única coisa que pede alguém; um
segundo selo cheio ao lado tiraria dele o poder de apontar.

⚠️ **O `LEFT JOIN LATERAL` do chamado é o MESMO do `GET /operador/orcamentos`.**
Se as duas telas mostram o mesmo selo, têm de escolher a mesma linha — senão o
admin diz uma coisa e o operador diz outra sobre o mesmo orçamento.

## Direção — IMPLEMENTADA em 20–21/08/2026

⚠️ Esta seção dizia "não implementada" até 20/08. As 15 telas foram migradas
na branch `feature/admin-chapa`; o que segue é o que foi feito, não o que se
pretendia. Os defeitos medidos acima ficam como **registro do antes** — não
descrevem mais a tela.

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

**Ordem de execução seguida:** pele (tokens + `@font-face`) → faixa, selo e
rótulo → ficha colapsável → tabela padrão → placa clara nos modais → tela a
tela.

### O que cada decisão virou

| # | Decisão | Resultado |
|---|---|---|
| 1 | Faixa de KPI em uma linha | 120–330px → **54px**, e virou **uma placa dividida por cortes**, não seis cartões |
| 2 | Ficha só quando há ficha | Colapsa e desliza; gatilho `:has()` no placeholder, vale nas 6 telas de `.ch-*` + Atendimento |
| 3 | Um selo de estado | Preenchido pede ação, de fio em repouso; **só uma dimensão preenche por linha** |
| 4 | Rótulo declara a unidade | Unidade ao lado do NÚMERO (leitura de instrumento), não dentro do rótulo |
| 5 | `planos` como molde | Aplicado em Chamados, Alertas, Clientes e no painel ao vivo de Relatórios |

### O que a migração achou, e que o estudo não tinha visto

- **"ALERTAS CRÍTICOS" na Telemetria era rótulo errado**, não ambíguo: o número
  vem de `_alertasAtivosUnificados()`, que conta todos os alertas ativos. O
  "8 aqui, 7 em Alertas" eram medidas diferentes, e uma mentia.
- **A faixa de KPI de Alertas era uma segunda cópia da barra de abas** — mesmos
  números, e clicar num card só trocava a aba. Removida; o tempo médio, único
  número que as abas não davam, virou leitura na barra.
- **Três KPIs de Chamados repetiam as abas logo abaixo.** Removidos. A divisão
  agora é de pergunta: abas respondem "o que está na lista", faixa responde
  "como estamos indo".
- **"Uso do TTR" mostrava `12750%`.** Virou "estourou há 21 dias". O percentual
  segue no `title`; a ordenação continua no `ORDER BY pct_ttr DESC`.
- **A barra de estado do feed do Dashboard era ELEMENTO, não `border-left`** —
  por isso o detector nunca a pegou.
- **Papel de usuário e tipo de serviço estavam preenchidos**; categoria não é
  estado. E "Etiqueta em branco" e "Baixada" estavam, respectivamente, sem selo
  nenhum e em vermelho cheio.

### Armadilhas que custaram tempo (não repetir)

- **`clip-path` faz do elemento bloco de contenção para `position: fixed`.**
  Chanfrar o `.main` quebrava o `#cfgModalOverlay` e o mapa em tela cheia, que
  vivem dentro dele. Por isso **a moldura é esquadrada e só as peças são
  cortadas**.
- **`:has()` ignora `display: none`.** `.ch-layout:has(.al-empty)` com
  descendente solto casava com um placeholder escondido na coluna da LISTA em
  Orçamentos, e zerava o gap daquela tela. Caminho exato, sempre.
- **Crase dentro de template literal fecha o template.** Um comentário HTML com
  o nome de uma tag entre crases, dentro do render do modal de orçamento, virou
  código: o modal abriu em branco e o `alert()` do catch travou o navegador.
- **Tokens translúcidos sem `backdrop-filter` vazam.** `--surface` virou `rgba`
  na troca de pele e o modal de histórico deixou a página aparecer através
  dele. Os três de superfície agora são opacos.

⚠️ O risco está na consolidação do vocabulário, não na pele: 8.273 linhas e 22
prefixos, com `.wa-*` e `.ch-*` atravessando 10 e 6 telas. Renomear com alias
temporário (`.wa-tabs, .abas { … }`) é o que torna a mudança reversível.

---

Ver também: [`painel-cliente.md`](painel-cliente.md) ·
[`landing-publica.md`](landing-publica.md) ·
[`chamados-sla.md`](chamados-sla.md) · [`../arquitetura.md`](../arquitetura.md)
· [`../../CLAUDE.md`](../../CLAUDE.md) (cache em 3 camadas — obrigatório ao
mexer em `admin.css`).
