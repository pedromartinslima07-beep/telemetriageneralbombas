# Plano de Implementação — Política de Criticidade e SLA (P1-P4)

## Contexto
Sistema SaaS de telemetria de condomínios. Implementação da classificação de chamados
com níveis P1/P2/P3/P4 substituindo a nomenclatura antiga (emergencia/alta/media/baixa).

---

## Regras de Classificação

### Fórmula
Criticidade = Risco Técnico + Impacto Operacional + Recorrência + Estratégia do Cliente + Urgência Real

### Níveis e SLA (chegada do técnico)
| Nível | SLA | Descrição |
|---|---|---|
| P1 CRÍTICO | ≤ 3h | Condomínio não pode esperar |
| P2 ALTA | 24–48h | Funciona parcialmente, risco de agravar |
| P3 CONTROLADO | ≤ 72h | Cabe na agenda |
| P4 AGENDADO | Conforme agenda | Sem urgência |

> **Importante:** SLA mede chegada do técnico, NÃO resolução do problema.

### Fluxo de Triagem (pare no primeiro SIM)
- **Q1:** Condomínio sem água, alagando, esgoto subindo, queimado ou risco de incêndio? → P1
- **Q2:** Sistema funciona em modo parcial, contingência, manual ou redundância comprometida? → P2
- **Q3:** Funciona normalmente, mas precisa de inspeção, ajuste ou pequena correção? → P3
- **Q4:** É preventiva, projeto, retrofit, orçamento ou instalação planejada? → P4

**Regra de desempate:** dúvida entre dois níveis → prevalece o MAIOR.

### Exemplos por nível
**P1:** Condomínio inteiro sem água, alagamento subsolo, retorno grave de esgoto,
cheiro de queimado/curto-circuito, bomba de incêndio inoperante, VRP cessando distribuição.

**P2:** Uma bomba do duplex parou (outra opera), automático falhou (manual funciona),
ruído/vibração relevante, inversor alarmando mas sistema operando, vazamento moderado controlado.

**P3:** Revisão técnica ou inspeção, pequeno vazamento sem risco,
reclamação de 1 apartamento isolado, solicitação de orçamento.

**P4:** Visita preventiva mensal, retrofit ou modernização,
substituição planejada de equipamento, levantamento comercial.

### Regras Especiais
- Redundância SÓ reduz criticidade se a contingência está realmente funcionando
- Falha recorrente (mesma falha no mês) sobe um nível automaticamente
- Drenagem em manual sem operador com chuva prevista = P1
- SLA mede chegada do técnico, NÃO resolução do problema
- Todo condomínio cadastrado é cliente com contrato de manutenção preventiva

---

## Decisões de Produto

| Questão | Decisão |
|---|---|
| Quem faz a triagem? | Sistema sugere P1-P4 via Q1→Q4, admin confirma ou troca |
| Tipo de contrato | Ignorado — todo condomínio é preventivo |
| Como registrar chegada do técnico? | Botão "A caminho" + botão "Chegou" no app mobile |
| Nomes internos no banco | Migrar para p1/p2/p3/p4 (não só display) |

---

## Plano de Implementação

### [ ] Migration 028_sla_p1p4.sql
- Renomear valores: `emergencia→p1`, `alta→p2`, `media→p3`, `baixa→p4`
- Atualizar CHECK constraint em `chamados`
- Atualizar `sla_definicoes`: renomear linhas + novos tempos (p1=180min, p2=1440min, p3=4320min, p4=NULL)
- Adicionar coluna `sla_chegada_min` em `sla_definicoes`
- Adicionar `tecnico_a_caminho_em TIMESTAMPTZ` em `chamados`
- Adicionar `tecnico_chegou_em TIMESTAMPTZ` em `chamados`

### [ ] Backend — chamados.routes.js
- Atualizar array `PRIORIDADES`: `["p1","p2","p3","p4"]`
- Atualizar `CASE WHEN` de ordenação
- Novo endpoint `POST /chamados/:id/a-caminho` — registra `tecnico_a_caminho_em`
- Novo endpoint `POST /chamados/:id/chegou` — registra `tecnico_chegou_em`
- Detecção de recorrência: mesma categoria + mesmo condomínio nos últimos 30 dias → bump automático de 1 nível

### [ ] Backend — cliente.routes.js
- Remapear `CATEGORIA_PRIORIDADE`: `sem_agua→p1`, `vazamento→p2`, `bomba_falha→p2`, `nivel_baixo→p3`, `ruido→p3`, `manutencao→p4`, `outro→p3`

### [ ] Backend — admin.routes.js
- Atualizar `PRIORIDADES_ORDEM` e `CASE WHEN` de ordenação

### [ ] Backend — ia.service.js
- Atualizar enum e descrições para p1/p2/p3/p4

### [ ] Backend — offline.job.js
- `'alta'` → `'p2'`

### [ ] Frontend — admin.js + admin.css
- Renomear mapas `_chPrioNome`, `_SLA_PRIO_LABEL`, `_SLA_PRIO_ORDEM` para p1-p4
- Atualizar classes CSS: `ch-prio-emergencia→ch-prio-p1`, `ch-prio-alta→ch-prio-p2` etc.
- Renomear tab "emergencia" → "p1" com label "P1 Crítico"
- Triage wizard no formulário "Novo chamado": Q1→Q4, sistema sugere, admin confirma
- Exibir `tecnico_a_caminho_em` e `tecnico_chegou_em` no detalhe do chamado
- SLA de chegada: badge separado do TTFR existente

### [ ] Frontend — app.js + app.css (mobile)
- Atualizar `PRI_RANK` e `PRI_LABEL` para p1-p4
- Atualizar comparações e classes CSS
- Botão "A caminho" e botão "Chegou" no detalhe do chamado
- Atualizar dados de demonstração (mock)

---

## Status
- [x] Migration 028
- [x] chamados.routes.js
- [x] cliente.routes.js
- [x] admin.routes.js
- [x] ia.service.js
- [x] offline.job.js
- [x] admin.js + admin.css
- [x] app.js + app.css

---

## Backlog — Análise de Schema (para atacar depois)

### Redundâncias confirmadas

**1. Sistema de orçamentos duplicado (maior problema)**
- `ordens_servico` tem 12 colunas `orcamento_*` direto + tabela `orcamento_itens` para itens
- Em paralelo existe `orcamentos` + `orcamento_linhas` (sistema standalone mais limpo)
- Migration 027 já adicionou `orcamentos.os_id` como ponte, mas ambos coexistem
- **Ação:** migrar tudo para `orcamentos`/`orcamento_linhas`, dropar as 12 colunas `orcamento_*` da OS e a tabela `orcamento_itens`

**2. FK bidirecional chamados ↔ ordens_servico**
- `chamados.ordem_servico_id` → ordens_servico
- `ordens_servico.chamado_id` → chamados
- Uma direção é suficiente; `chamados.ordem_servico_id` é redundante

**3. `responsavel_id` vs `tecnico_id` em chamados**
- `responsavel_id` → usuarios (admin acompanhador)
- `tecnico_id` → tecnicos (quem executa)
- Verificar se `responsavel_id` está sendo populado/lido; pode ser campo morto

**4. `mensagens_whatsapp.ia_urgencia` usa enum antigo**
- Ainda tem `'baixa'|'media'|'alta'|'emergencia'` enquanto tudo migrou para p1-p4
- Baixo risco imediato, mas inconsistente

### Tabelas faltando (por prioridade de impacto)

**1. `planos_manutencao` — alta prioridade**
- Todo condomínio tem contrato preventivo mas não há gestão disso no banco
- Permitiria: gerar P4 automaticamente quando vence, dashboard de compliance preventivo
- Colunas sugeridas: `condominio_id`, `titulo`, `periodicidade_dias`, `proxima_em`, `ultima_em`, `tecnico_responsavel_id`, `ativo`

**2. `equipamentos` — média prioridade**
- Só `reservatorios` é rastreado; bombas, motores, painéis não têm identidade no sistema
- Sem isso: `os_pecas` registra "trocou bomba X" mas não vincula ao equipamento físico
- Colunas sugeridas: `condominio_id`, `tipo`, `marca`, `modelo`, `numero_serie`, `instalado_em`, `garantia_ate`

**3. `historico_chamados` — média prioridade**
- Só o estado atual é salvo; não dá ver quem alterou prioridade/status nem quanto tempo cada fase durou
- Essencial para relatórios SLA ricos e accountability
- Colunas sugeridas: `chamado_id`, `campo_alterado`, `valor_anterior`, `valor_novo`, `alterado_por`, `alterado_em`

**4. `contratos` — média prioridade**
- Sistema sabe que todo condomínio é cliente com contrato, mas não guarda valor, vigência, tipo de plano
- Sem isso não há alertas de renovação nem relatório de receita recorrente
