---
tags:
  - projeto
  - fluxo
aliases:
  - Ordens de Serviço
  - O.S.
  - Orçamentos
  - GPS
---
# Fluxo: Ordens de Serviço, Orçamentos e GPS

## Ordem de Serviço (O.S.) digital

Documento de execução preenchido pelo técnico no campo, geralmente vinculado a
um chamado.

### Ciclo

1. **Criação** — `POST /ordens-servico` (adminOnly) vincula `chamado_id`,
   `condominio_id`, `tecnico_id`.
2. **Preenchimento** (técnico dono, guard `osDonoOuAdmin({forWrite:true})`):
   - `PATCH /ordens-servico/:id` — dados da execução.
   - **Fotos:** `POST /:id/fotos/upload` ou `/:id/fotos` (base64 comprimido
     client-side ~150-300KB; `express.json` aceita até 8mb). `os_fotos`.
   - **Peças:** `POST/PATCH/DELETE /:id/pecas[/:peca_id]`. `os_pecas`.
   - Sinaliza se há orçamento necessário (`orcamento_necessario`,
     `orcamento_observacoes`).
3. **Finalização** — `POST /:id/finalizar` (assinatura) marca `finalizada_em` e
   **gera o PDF** (`os-pdf.service.js`, Puppeteer).
4. **Acesso ao PDF** — `GET /:id/pdf` (dono ou admin);
   `GET /cliente/ordens-servico/:id/pdf` (cliente do condomínio).

Uploads servidos em `/uploads` (estático, cacheável). Regerar PDFs em lote:
`scripts/regenerar-pdfs-os.js`.

## Orçamentos (sistema unificado)

> **Contexto histórico:** até a migration 030 coexistiam dois sistemas paralelos
> — colunas `orcamento_*` na O.S. + `orcamento_itens` (A) e as tabelas
> `orcamentos`/`orcamento_linhas` (B). A 030 unificou em B (com backfill em
> transação) e removeu A. A O.S. **mantém** só `orcamento_necessario` e
> `orcamento_observacoes` (input do técnico, semente do orçamento). As rotas
> ainda usam `:os_id` na URL, mas resolvem o `orcamento_id` via
> `_garantirOrcamentoDaOs` (cria com número `OR-XXXXXX` se não existir).

Hoje existe **um** sistema: tabela `orcamentos` + `orcamento_linhas`. A `origem`
distingue a procedência:

- **`os`** — orçamento derivado de uma O.S. (`os_id`).
- **`ia`** — solicitação criada pela IA via WhatsApp (entra como rascunho +
  email à equipe comercial).
- **`admin`** — orçamento avulso criado no painel.

### Endpoints (`/admin/orcamentos*`)

- Ligados a O.S.: `GET/PATCH /admin/orcamentos[/:os_id]`, itens em
  `/admin/orcamentos/:os_id/itens`, PDF em `/admin/orcamentos/:os_id/pdf`.
- **Avulsos:** `GET/POST/PATCH/DELETE /admin/orcamentos/avulsos[/:id]`, linhas
  em `/avulsos/:id/linhas`, PDF em `/avulsos/:id/pdf`.

Estados: rascunho → enviado/pendente → aprovado (`aprovado_em`/`aprovado_por`)
ou rejeitado (`motivo_rejeicao`). PDF via `orcamento-pdf.service.js`
(Puppeteer **singleton** — sem cold start no Railway).

## Rastreamento GPS dos técnicos

- App do técnico envia posição periodicamente: `POST /tecnicos/localizacao`
  (frequência via `gps.frequencia_segundos`, default 60s).
- Posição atual em `tecnico_localizacoes` (1 linha por técnico); trilha em
  `tecnico_localizacoes_historico`.
- Admin: `GET /tecnicos/localizacao` (mapa de posições),
  `GET /tecnicos/:id/historico-gps`.
- Retenção do histórico via `gps-cleanup.job.js` (`gps.retencao_horas`).
- A IA usa o GPS para estimar ETA (`buscar_status_tecnico` → Haversine).

## Planos de manutenção e contratos

- **`planos_manutencao`** — preventiva recorrente por condomínio
  (`periodicidade_dias`); `planos-manutencao.job.js` gera chamado **P4** ao
  vencer (`planos.geracao_enabled`). `POST /planos-manutencao/:id/executar-agora`
  força a geração.
- **`contratos`** — `tipo` (mensal/anual/avulso), `valor_mensal`,
  `dia_vencimento`; métricas em `GET /contratos/metricas`. Índice único de
  contrato ativo por condomínio.
