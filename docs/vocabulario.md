---
tags:
  - projeto
  - doc/vocabulario
aliases:
  - Vocabulário
  - Glossário
  - Palavras da interface
---
# Vocabulário da interface

Como o sistema **fala** com quem o usa. Nasceu em 28/08/2026 de um pedido do
Pedro — *"até eu me perco nas siglas muitas vezes"* — e vale para **todas as
superfícies**, não para uma tela.

> ⚠️ **Isto é sobre TEXTO DE INTERFACE, nunca sobre o banco.** `nivel_baixo`,
> `p1`, `ttfr_min`, `os_id` continuam exatamente como estão em coluna, enum,
> rota e payload. Renomear schema não é assunto deste documento, e misturar as
> duas coisas é como se quebra um sistema em produção.

Contexto de produto: [PRODUCT.md](../PRODUCT.md) · Sistema visual:
[DESIGN.md](../DESIGN.md) · Índice: [Home](../Home.md)

---

## A regra

**Nem toda sigla é igual, e tratar todas do mesmo jeito é o erro.**

| | O que é | O que fazer |
|---|---|---|
| **Vocabulário do ramo** | A equipe usa **falando**: "abre a O.S.", "isso é P1". Existe fora do software. | **Mantém.** Trocar por perífrase (*"ordem de serviço"* em todo lugar) deixa o texto mais longo e não mais claro para quem já usa a palavra. |
| **Sigla do software** | Só existe dentro deste sistema: TTFR, TTR, KPI. Ninguém diz isso em voz alta na casa de máquinas. | **Sai.** É a que faz a pessoa parar e tentar lembrar. |
| **Sigla de contrato** | SLA aparece em contrato de manutenção e o cliente pode conhecer. | **Vira palavra na tela, e a sigla vira apoio** — quem conhece reconhece, quem não conhece entende. |

**O teste, quando bater dúvida:** *alguém diria isso em voz alta para um
colega?* "Passa a O.S. pro Marcos" — sim. "O TTFR estourou" — não.

---

## A tabela

### Sai (sigla do software)

| Hoje | Passa a ser | Onde aparece |
|---|---|---|
| `TTFR` | **Primeira resposta** | admin (metas, badge, coluna) |
| `TTFR estourado` | **Sem resposta no prazo** | admin (badge) |
| `TTFR (min)` | **Primeira resposta (min)** | admin (configuração) |
| `TTR` | **Resolução** | admin (metas, badge, coluna) |
| `TTR estourado` | **Não resolvido no prazo** | admin (badge) |
| `TTR (min)` | **Resolução (min)** | admin (configuração) |
| `KPI` | *(nunca aparece como palavra na tela — é nome de código)* | admin |
| `ETA` | **Previsão de chegada** | admin, operador |

⚠️ Com isso, a **legenda de rodapé some** — hoje o admin escreve
*"TTFR = tempo até primeira resposta da equipe · TTR = tempo até resolução"*
embaixo da tabela. Rótulo que precisa de legenda é rótulo errado; quando o
rótulo é a palavra, a legenda deixa de existir.

### Vira palavra, sigla como apoio

| Hoje | Passa a ser |
|---|---|
| `SLA` (título) | **Prazo** |
| `Metas de SLA por Prioridade` | **Prazos por prioridade** |
| `com SLA estourado` | **fora do prazo** |
| `SEM SLA` | **Sem prazo definido** |
| `ATÉ ESTOURAR` | **Para vencer** |
| `+37min` (régua) | **37min atrasado** |

### Fica (vocabulário do ramo)

| Termo | Por quê |
|---|---|
| `O.S.` | A equipe fala assim. Escrever "ordem de serviço" em botão de app de campo custa espaço e não ganha clareza. |
| `P1 · P2 · P3 · P4` | Prioridade é conversa diária ("isso é P1"). **Mas ganha a palavra ao lado na primeira aparição** — `P1 Crítico`, `P4 Agendado` — como o admin já faz em `_chPrioNome`. |
| `GPS` | Universal. |
| `WhatsApp` | Nome próprio. |

### Estado, dito em português

| Hoje | Passa a ser |
|---|---|
| `DISPONÍVEL` (técnico) | **Livre agora** |
| `INDISPONÍVEL` | **Ocupado** |
| `sem GPS` | **Sem posição** |
| `EM ATENDIMENTO` | **Em atendimento** — só sai da caixa alta |

⚠️ **"Em atendimento" NÃO vira "Técnico a caminho"**, e a primeira versão
deste documento errou nisso. `em_atendimento` é o status do CHAMADO; se o
técnico já chegou, "a caminho" passa a ser mentira — o item da fila já
distingue as três situações ("atribuído" · "a caminho" · "no local") num campo
próprio. O que atrapalhava ali era a **caixa alta**, não as palavras.
Lição geral: antes de trocar um rótulo, confira o que o dado de fato
significa — texto mais claro que diz coisa errada é pior que sigla.

---

## Regra de escrita, além das siglas

1. **Caixa alta só em etiqueta curta.** Frase inteira em CAIXA ALTA é o
   tratamento mais lento de ler que existe — o olho perde o contorno da
   palavra e soletra. Se tem mais de duas palavras, é frase, e frase é em
   caixa normal.
2. **O rótulo diz o que acontece, não o nome do campo.** "Para vencer" em vez
   de "TTR restante".
3. **Nada de definição por sigla + legenda.** Se precisou de legenda, troque o
   rótulo.

---

## Estado da aplicação

| Superfície | Situação |
|---|---|
| Painel do cliente · Orçamentos do cliente | ✅ **Já limpo** — nasceu escrito para o síndico |
| Landing · Login | ✅ Já limpo |
| **Painel do operador** | ✅ **Feito em 28/08/2026** — e junto veio a escala (ver abaixo) |
| **Painel admin** | 📋 O maior volume: SLA, TTFR, TTR, O.S., KPI |
| **App do técnico** | 📋 O.S. (fica, por ser do ramo) — revisar o resto |

---

## O que o operador ganhou junto (28/08/2026)

Vocabulário sozinho não resolve para quem tem pouca familiaridade com
computador. No mesmo passe, a pedido do Pedro:

| | Antes | Depois |
|---|---|---|
| Texto abaixo de 12px | **64%** (76 de 118 blocos) | **10%** |
| Corpo | 13px | **15px** |
| Etiqueta mono | 10,5px | **12px** |
| Botões abaixo de 44px | **11 de 11** | **0** |
| Blocos em CAIXA ALTA | 39 | 21 (só etiqueta curta) |

Custou densidade — de ≈3 para ≈2 itens na primeira tela — e isso foi decisão
consciente: **rolar é mais fácil que espremer os olhos.** O corpo de 13px vinha
do registro de operação do admin, calibrado para quem usa o sistema o dia
inteiro; não é o público desta tela. O `PRODUCT.md` já dizia, para público
envelhecido, que *"corpo generoso, contraste alto e alvos grandes não são
refinamento, são requisito"* — estava escrito para o síndico, e vale igual
para quem opera.

⚠️ **A caixa alta importa tanto quanto o tamanho.** Frase inteira em CAIXA
ALTA é o tratamento mais lento de ler que existe — o olho perde o contorno da
palavra e soletra letra a letra. Saiu de: a régua do relógio, o estado do
técnico, "Prédio sem telemetria instalada", a linha de origem e o cabeçalho da
fila. **Ficou** onde classifica em uma ou duas palavras: bairro, prioridade,
título de seção.

⚠️ **O detector CAIU de 47 para 40 advertências de `font-size`** — consolidar
a rampa eliminou degraus em vez de criar. Aumentar tipo não custou entropia.
