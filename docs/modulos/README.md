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
| Mapa, geocoding e tiles | [`mapa-geocoding.md`](mapa-geocoding.md) |

Referências cruzadas: [`../banco-de-dados.md`](../banco-de-dados.md),
[`../api.md`](../api.md), [`../arquitetura.md`](../arquitetura.md).
