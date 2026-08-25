---
tags:
  - projeto
  - moc
aliases:
  - Fluxos de Negócio
  - Módulos
---
# Fluxos de Negócio (Módulos)

Cada arquivo descreve um fluxo ponta a ponta — quem dispara, o que o backend
faz, quais tabelas/serviços/jobs participam e as regras de decisão.

| Fluxo | Arquivo |
|---|---|
| Autenticação (login + OTP + trusted device) | [`autenticacao.md`](autenticacao.md) |
| Telemetria (ESP32 → leitura → alerta) | [`telemetria.md`](telemetria.md) |
| Atendimento WhatsApp + IA | [`whatsapp-ia.md`](whatsapp-ia.md) |
| Chamados, criticidade P1–P4 e SLA | [`chamados-sla.md`](chamados-sla.md) |
| Ordens de Serviço, orçamentos e GPS | [`ordens-servico.md`](ordens-servico.md) |
| Equipamentos, etiqueta QR e oficina | [`equipamentos.md`](equipamentos.md) |
| Mapa, geocoding e tiles | [`mapa-geocoding.md`](mapa-geocoding.md) |
| App mobile (Capacitor) — GPS background pendente | [`app-mobile.md`](app-mobile.md) |
| Landing pública e captação de lead | [`landing-publica.md`](landing-publica.md) |
| Painel do cliente ("Meu prédio") | [`painel-cliente.md`](painel-cliente.md) |
| Envio do orçamento por e-mail (duas opções) | [`orcamentos-envio.md`](orcamentos-envio.md) |
| Painel admin (operação interna) — 15 telas, 3 moldes | [`painel-admin.md`](painel-admin.md) |

Referências cruzadas: [`../banco-de-dados.md`](../banco-de-dados.md),
[`../api.md`](../api.md), [`../arquitetura.md`](../arquitetura.md).
