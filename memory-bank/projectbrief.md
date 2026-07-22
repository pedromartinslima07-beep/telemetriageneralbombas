---
tags:
  - projeto
  - contexto/visao
aliases:
  - Project Brief
  - Visão do Projeto
---
# Project Brief — Telemetria General Bombas

## Objetivo do sistema

Plataforma de **telemetria IoT + gestão de manutenção predial** para a General
Bombas. O núcleo monitora remotamente **reservatórios de água e bombas
hidráulicas** em condomínios, ingerindo leituras de dispositivos ESP32 via
HTTPS, gerando alertas automáticos e expondo painéis web (admin e cliente).

A partir daí o sistema cresceu para cobrir **todo o ciclo de manutenção**:

- **Telemetria** — nível dos reservatórios (sonda 4-20mA) e status da bomba
  (sensor de corrente SCT-013), com calibração e limiares configuráveis pelo
  painel (sem regravar firmware).
- **Atendimento via WhatsApp + IA** — assistente de atendimento que conversa
  com clientes em linguagem natural, consulta dados reais (telemetria, chamados)
  e **sugere ações que o backend executa** (a IA nunca executa diretamente).
- **Chamados e SLA** — classificação de criticidade P1–P4 com SLA de chegada do
  técnico, recorrência, e dashboard de SLA.
- **Ordens de Serviço digitais** — preenchidas no campo pelo técnico (fotos,
  assinatura, orçamento) com geração de PDF.
- **Rastreamento GPS** dos técnicos e estimativa de ETA.
- **App mobile (Capacitor)** para técnicos (atendimento em campo) e clientes/
  síndicos (acompanhamento + abertura de chamados).
- **Orçamentos, contratos e planos de manutenção**.

**Em produção:** telemetria.generalbombas.com (deploy no Railway).

## Público-alvo

- **Clientes** são majoritariamente **condomínios (B2B)** com gestão predial.
  Há casos raros de pessoa física (casa/comércio) — a IA deve perguntar o
  contexto antes de assumir.
- **Roles:** `admin` (acesso total), `admin_viewer` (somente leitura),
  `tecnico` (campo + GPS + O.S.), `cliente` (escopo do próprio condomínio).
  O role `master_admin` foi **removido** (existia no código mas nunca foi usado).

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node.js + Express 4 |
| Banco | PostgreSQL (Railway prod) via `pg` |
| Auth | JWT (7 dias) + 2FA por email (OTP via Resend) + trusted devices (cookie httpOnly) |
| Frontend web | HTML/CSS/JS **puro** (sem framework/build), PWA instalável |
| App mobile | Capacitor (empacota `app/public/` — HTML/CSS/JS puro) |
| IA | OpenAI `gpt-4o-mini` (function calling) |
| WhatsApp | **Meta WhatsApp Business API** (migrado de Evolution API) |
| Visualização | Chart.js + ApexCharts + Leaflet (mapas) |
| Firmware | ESP32 (Arduino C++) |
| PDF | Puppeteer (singleton, browser reutilizado) |
| Hardening | Helmet, CORS por env, express-rate-limit, bcrypt |

## Princípios deliberados (não mudar sem motivo)

- **Stack vanilla.** Frontend e app mobile são HTML/CSS/JS puro servidos pelo
  Express. **Não migrar para Next/React/Vite.** Foi escolha consciente.
- **Visual Mission Control.** O app mobile e todas as páginas herdam tokens e
  componentes de `public/admin.css` (paleta dark premium, brand amber
  `--accent: #f0b014`). Nunca criar paleta paralela.
- **A IA interpreta, consulta e sugere; o backend executa.** Ações não-P1
  ficam pendentes até confirmação explícita do cliente.

Detalhes de convenções operacionais (cache em 3 camadas, migrations, jobs) em
[`../CLAUDE.md`](../CLAUDE.md). Ver também [`current-state.md`](current-state.md),
[`decisions.md`](decisions.md), [`roadmap.md`](roadmap.md).
