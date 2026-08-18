---
tags:
  - projeto
  - moc
aliases:
  - Home
  - Mapa de Conteúdo
  - Índice
---
# 🧠 Home — Telemetria General Bombas

Ponto de entrada do "segundo cérebro" deste projeto. Plataforma de telemetria
IoT + gestão de manutenção predial (reservatórios/bombas, WhatsApp+IA, chamados,
O.S., app mobile). Visão completa em [`README.md`](README.md).

> Convenção de navegação: links em markdown (`[texto](arquivo.md)`) — funcionam
> no GitHub **e** alimentam o grafo/backlinks do Obsidian. Tags em
> `frontmatter` permitem filtrar por `#projeto`, `#fluxo`, `#doc/*`, `#contexto/*`.

---

## 🧭 Contexto e direção (`memory-bank/`)

Por que o projeto existe, onde está e para onde vai.

- [`projectbrief.md`](memory-bank/projectbrief.md) — objetivo, stack, princípios `#contexto/visao`
- [`current-state.md`](memory-bank/current-state.md) — arquitetura, módulos, o que está pronto `#contexto/estado`
- [`active-work.md`](memory-bank/active-work.md) — foco atual e pendências `#contexto/em-andamento`
- [`roadmap.md`](memory-bank/roadmap.md) — fases, descartados, backlog futuro `#contexto/roadmap`
- [`decisions.md`](memory-bank/decisions.md) — **o "porquê"**: decisões, descartados, lições `#contexto/decisoes`

## 📚 Documentação técnica (`docs/`)

O "o quê" e o "como".

- [`arquitetura.md`](docs/arquitetura.md) — estrutura de pastas, dependências, integrações `#doc/arquitetura`
- [`banco-de-dados.md`](docs/banco-de-dados.md) — tabelas, relações, migrations `#doc/banco`
- [`api.md`](docs/api.md) — endpoints REST por módulo e role `#doc/api`
- [`changelog.md`](docs/changelog.md) — histórico por migration e fase `#doc/changelog`

## 🔄 Fluxos de negócio (`docs/modulos/`)

Como cada coisa funciona ponta a ponta. Índice em [`modulos/README.md`](docs/modulos/README.md).

- [`autenticacao.md`](docs/modulos/autenticacao.md) — login + OTP + trusted device `#fluxo`
- [`telemetria.md`](docs/modulos/telemetria.md) — ESP32 → leitura → alerta → retenção `#fluxo`
- [`whatsapp-ia.md`](docs/modulos/whatsapp-ia.md) — atendimento, state machine, curadoria `#fluxo`
- [`chamados-sla.md`](docs/modulos/chamados-sla.md) — criticidade P1–P4 e SLA `#fluxo`
- [`ordens-servico.md`](docs/modulos/ordens-servico.md) — O.S., orçamentos, GPS `#fluxo`
- [`equipamentos.md`](docs/modulos/equipamentos.md) — identidade da bomba, etiqueta QR, oficina `#fluxo`
- [`mapa-geocoding.md`](docs/modulos/mapa-geocoding.md) — geocoding híbrido + proxy de tiles `#fluxo`
- [`app-mobile.md`](docs/modulos/app-mobile.md) — Capacitor, GPS background (limitação + solução pendente) `#fluxo`
- [`landing-publica.md`](docs/modulos/landing-publica.md) — página `/`, captação de lead, sistema visual "Chapa" `#fluxo`
- [`painel-cliente.md`](docs/modulos/painel-cliente.md) — painel do síndico: "a resposta, não o painel", sem seções, tudo abre como ficha `#fluxo`
- [`painel-admin.md`](docs/modulos/painel-admin.md) — painel de operação: as 15 telas, os 3 moldes, os defeitos medidos e a direção proposta `#fluxo`

## ⚙️ Convenções

- [`CLAUDE.md`](CLAUDE.md) — fluxo de trabalho, cache em 3 camadas, pegadinhas
- [`INSTALACAO.md`](INSTALACAO.md) — instalação física (sonda + sensor)
- [`PRODUCT.md`](PRODUCT.md) — verdade de produto: público, posicionamento, provas reais e o que **não** pode ser inventado
- [`DESIGN.md`](DESIGN.md) — sistema visual "Chapa": landing pública, login e painel do cliente

---

## Como usar como segundo cérebro

- **Grafo** (Ctrl/Cmd+G): esta nota é o hub; os clusters acima viram ramos.
- **Backlinks** (painel lateral): cada nota mostra quem a referencia.
- **Busca por tag**: `#fluxo` lista os 6 fluxos; `#doc/banco` vai direto ao schema;
  `#contexto/decisoes` ao "porquê".
- **Quick switcher** (Ctrl/Cmd+O): aceita os `aliases` (ex.: "Schema", "SLA",
  "Endpoints", "O.S.").
- Ao criar nota nova, ligue-a a partir daqui (ou de uma nota relacionada) para
  ela não ficar órfã no grafo.
