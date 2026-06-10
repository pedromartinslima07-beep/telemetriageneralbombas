---
tags:
  - projeto
  - doc/changelog
aliases:
  - Changelog
---
# Changelog

Histórico técnico do projeto: evolução do schema (`migrations/NNN_*.sql`) e
marcos de produto por fase. O "porquê" das decisões está em
[`../memory-bank/decisions.md`](../memory-bank/decisions.md); o roadmap em
[`../memory-bank/roadmap.md`](../memory-bank/roadmap.md).

## Schema base (2026-03)

`database/schema.sql` + `database/migrations/` (datadas): telemetria pura —
`condominios`, `reservatorios`, `leituras`, `alertas`, `usuarios`. Depois:
`last_seen`, `nivel_pct`, remoção de device_key de condomínio, timestamps →
`timestamptz`, role `admin_viewer`, `login_codes` (OTP), `trusted_devices`,
calibração ADC, `bomba_rms`/`limiar_bomba`.

## Migrations numeradas (módulo WhatsApp/IA em diante)

| # | Migration | O que mudou |
|---|---|---|
| 001 | whatsapp_ia | `clientes_whatsapp`, `conversas_whatsapp`, `mensagens_whatsapp`, `chamados`; `usuarios.telefone` |
| 002 | mapa_categoria | `condominios.lat/lng`; `chamados.categoria` (enum) |
| 003 | condominio_cep | `condominios.cep` |
| 004 | alerta_comentarios | tabela `alerta_comentarios` (telemetria|chamado) |
| 005 | conversas_assumida | `conversas.assumida_por_id/assumida_em` (humano assume) |
| 006 | mensagens_lida | `mensagens.lida_em` (não-lidas) |
| 007 | conversa_em_atendimento | status `em_atendimento` |
| 008 | tecnicos | tabela `tecnicos` |
| 009 | chamados_tecnico_id | `chamados.tecnico_id` |
| 010 | configuracoes | tabela `configuracoes` (config dinâmica) |
| 015 | ordens_servico | `ordens_servico`, `os_fotos`, `os_pecas`; FK em chamados |
| 016 | tecnico_localizacoes | GPS atual + histórico; `tecnicos.usuario_id` |
| 017 | role_tecnico | role `tecnico` no CHECK de usuários |
| 018 | os_orcamento | `ordens_servico.orcamento_necessario/observacoes` |
| 019 | chamado_mensagens | `alerta_comentarios.foto_url`, texto opcional |
| 020 | chamado_avaliacao | `chamados.avaliacao_nota/comentario/em` (1-5) |
| 021 | chamados_alerta_atraso | `chamados.alerta_atraso_enviado_em` |
| 022 | chamados_sla | `chamados.primeira_resposta_em`, `tempo_resolucao_seg` |
| 023 | sla_definicoes | tabela `sla_definicoes` (ttfr/ttr) |
| 024–025 | orcamentos / orcamento_itens | sistema de orçamento A (depois unificado) |
| 026–027 | orcamentos_avulsos / os_link | sistema de orçamento B (`orcamentos`, `orcamento_linhas`) |
| 028 | sla_p1p4 | prioridade `p1-p4`; `tecnico_a_caminho_em/chegou_em`; `sla_chegada_min` |
| 029 | tecnico_perfil | perfil do técnico (foto, cpf, rg, ...) |
| 030 | unificar_orcamentos | **unifica** A+B em `orcamentos`; remove `orcamento_itens` e colunas formais de OS |
| 031 | ia_urgencia_p1p4 | `mensagens.ia_urgencia` → p1-p4 |
| 032 | planos_manutencao | tabela `planos_manutencao`; `chamados.plano_manutencao_id` |
| 033 | historico_chamados | auditoria de chamados |
| 034 | remove_fk_redundante | remove FK bidirecional chamados↔OS |
| 035 | contratos | tabela `contratos` |
| 036 | orcamento_origem | `orcamentos.origem` (admin|ia|os) |
| 037 | clientes_whatsapp_contexto | `tipo` (B2B/PF), `cadastrado_por`, `observacoes` |
| 038 | qualidade_conversas | curadoria de atendimento p/ treino da IA |
| 039 | conversa_aguardando_atendente | flag de escalonamento |
| 040 | conversa_aguardando_avaliacao | flag de avaliação pendente |
| 041 | ia_sem_avanco | contador anti-loop |
| 042 | conversa_state_machine | `estado_conversa` + `pendente_acao JSONB` |
| 043 | conversa_canal | `canal` (multi-canal futuro) |
| 044 | condominios_nome_fantasia | `condominios.nome_fantasia TEXT` (nome principal de exibição) |
| 045 | condominios_email | `condominios.email VARCHAR(255)` (e-mail para orçamentos) |
| 046 | multi_contratos | remove `idx_contratos_ativo_uniq` — permite múltiplos contratos ativos por condomínio |
| 047 | orcamento_envio_email | `orcamentos.enviado_em/enviado_para`; `condominios.email` → TEXT (múltiplos e-mails por vírgula) |
| 048 | colaboradores_cargo | `tecnicos.cargo` (tecnico/adm/gestor/ti) |
| 049 | usuarios_roles_novos | novos roles; `usuarios.condominio_id` |
| 050 | usuarios_email_template | template de e-mail por usuário |
| 051 | usuarios_assinatura_blob | assinatura digital em blob |
| 052 | trusted_devices_indefinido | trusted_devices sem expiração (permanente) |
| 053 | os_fotos_dados_base64 | `os_fotos.dados_base64 TEXT` — persiste imagem no banco para sobreviver a restarts do Railway (antes era salvo em disco efêmero) |

## Marcos de produto (fases do plano)

- **2026-06-10** — **Fotos de OS persistidas no banco de dados**
  - `os_fotos.dados_base64 TEXT` adicionado (migration 053).
  - Upload (`POST /ordens-servico/:id/fotos/upload`) salva o conteúdo base64 no banco em vez de gravar em disco.
  - Novo endpoint público `GET /ordens-servico/:osId/fotos/:fotoId/imagem` serve a imagem a partir do banco — compatível com `<img src="...">` sem header de auth.
  - URL armazenada na coluna `url` agora aponta para esse endpoint (`/ordens-servico/{osId}/fotos/{fotoId}/imagem`).
  - PDF (`os-pdf.service.js`): `fotoToDataUrl` usa `dados_base64` do row; fallback para disco (registros legados).
  - `GET /ordens-servico/:id` exclui `dados_base64` da query de fotos para não inflar respostas.
  - **Motivo:** Railway usa sistema de arquivos efêmero — `uploads/` é apagado a cada deploy/restart, perdendo todas as fotos.

- **2026-06-10** — **GPS background no APK (Fase 7G-pre)**
  - Instalado `@capacitor-community/background-geolocation@1.2.26` em `app/`.
  - `ACCESS_BACKGROUND_LOCATION` adicionado ao `AndroidManifest.xml` (serviço foreground e demais permissões já declarados pelo plugin e mergeados via Gradle).
  - `_gpsAbrirWatch()` detecta `window.Capacitor.isNativePlatform()` e usa `BackgroundGeolocation.addWatcher()` quando no APK; fallback para `watchPosition` no browser/PWA.
  - `_gpsFecharWatch()` chama `BackgroundGeolocation.removeWatcher()` ao parar o GPS nativo.
  - `GPS.bgWatcherId` adicionado ao estado. Toda lógica de horário (8h–18h), throttle, fallback de ping e chip de UI foi preservada — só o backend de captura mudou.

- **2026-06-08** — **GPS técnicos: indicador visual de pin desatualizado + remoção de "Top 5" redundante**
  - **Pin de técnico "stale":** pins no mapa (MC e Mapa) ficam cinza/opacos quando a última atualização GPS tem mais de 3 minutos. Função `_tecStale(capturadaEm)` + classe `.tec-pin.is-stale` (fundo cinza, sem animação pulse). Tooltip mostra "⚠ sem sinal (X min atrás)"; popup do Mapa exibe aviso em vermelho.
  - **"Top 5 condomínios" removido** da aba Chamados do Dashboard SLA — redundante com "Condomínios mais problemáticos" que já existe na mesma página.
  - **Hard delete de condomínio corrigido:** exclusão em cascata de chamados, OS, orçamentos, leituras, alertas, comentários, WhatsApp. `usuarios.condominio_id` recebe `SET NULL` (usuários não são deletados). `admin.js?v=147`, `admin.css?v=103`.

- **2026-06-08** — **App mobile (Capacitor): APK de teste gerado + correções**
  - **Projeto Android gerado** (`app/android/`) via `@capacitor/android@6.1.0`; permissões de GPS adicionadas ao `AndroidManifest.xml`.
  - **Ícone do app** gerado com `@capacitor/assets` a partir de `public/favicon.png` (74 arquivos — ícones adaptativos + splash em todas as densidades).
  - **`API_BASE` corrigido para Capacitor com `androidScheme: "https"`:** com esse scheme, `window.location.protocol` é `"https:"` (não `"capacitor:"`), então a detecção anterior falhava e todas as chamadas iam para `https://localhost` (interceptado pelo WebView). Fix: adiciona cheque `|| origin === "https://localhost"` em `app/public/app.js`.
  - **Chip GPS reposicionado no app mobile:** `.gps-chip` era `position: fixed; top: 10px` e sobrepunha o header com o nome do técnico. Corrigido para `top: calc(env(safe-area-inset-top, 0px) + 72px)` em `app/public/app.css`.
  - **Footer "GPS aguardando..." corrigido:** `watchPosition` atualizava `GPS.last` mas nunca `TC.geo`; o footer checava `TC.geo` para exibir "GPS ativo". Fix: sincroniza `TC.geo` a partir de `GPS.last` a cada fix válido do watch.
  - **`OTP_DISABLED` temporariamente sem guarda de prod** (`&& !isProd` removido em `src/routes/auth.routes.js`) para facilitar testes do APK. Reverter após testes.
  - Railway configurado para deployar branch `feature/app-mobile` (em vez da `main` desatualizada). `CORS_ORIGINS` precisa incluir `https://localhost`.

- **2026-06-05** — **GPS técnicos: correções de rota, feedback de sinal e UX**
  - **Conflito de rotas corrigido:** `tecnicosLocalizacaoRouter` agora registrado antes de `tecnicosRouter` em `src/app.js`. O `DELETE /:id` do router de CRUD interceptava `DELETE /tecnicos/localizacao` (logout), impedindo a remoção do pin ao sair.
  - **Endpoint `/tecnicos/me`** movido para `tecnicos-localizacao.routes.js` e **`DELETE /localizacao`** adicionado ao mesmo router (ficavam faltando).
  - **Filtro de precisão GPS com feedback:** posições com `precisao_m > 15 km` continuam bloqueadas (geolocalização por IP pura), mas agora disparam `GPS.lastError = "low_accuracy"`. O chip mostra "Sinal fraco" e o banner exibe mensagem orientando o técnico a ativar o GPS do celular. Antes o chip mostrava "GPS ativo" sem nenhum aviso.
  - **`maximumAge` revertido de 0 → 30 000 ms** — valor zero forçava fix GPS fresco a cada callback; em áreas com sinal ruim travava a emissão do primeiro ping.
  - **Ícone de pin de técnico unificado:** mapa do dashboard (Mission Control) e seção Mapa agora usam a mesma função `_tecPinIcon()` — círculo roxo 32×32 com glow e animação pulse. Antes o MC usava div inline amb
er sem animação.
  - **Botões de ações de usuários redesenhados** (Configurações → Usuários): três botões de texto ("Editar / Resetar senha / Remover") substituídos por ícones quadrados 28×28 px com tooltip nativo. Classe `.cfg-icon-btn` adicionada ao `admin.css`.
  - **`<meta name="mobile-web-app-capable">`** adicionado ao `app/public/index.html` (padrão atual, ao lado da tag Apple que permanece para iOS).
  - `admin.js?v=144`, `admin.css?v=102`.

- **2026-06-05** — **Ajustes de layout — painel de detalhes e lista ch-layout**
  - `.content` passou a ser flex container (`display: flex; flex-direction: column`) para propagar altura às seções filhas.
  - `.section.is-active` ganhou `flex: 1` — ocupa todo o espaço disponível no `.content`.
  - `.ch-layout` mudou de `align-items: stretch` para `align-items: flex-start`; `.ch-list-col` recebeu `align-self: stretch` explícito.
  - Resultado: lista (esquerda) vai até o fundo da página; painel de detalhes (direita) tem apenas a altura do conteúdo — pequeno quando vazio, cresce com o item selecionado.
  - Aplica a todas as telas com `.ch-layout`: Alertas, Chamados, Clientes, Colaboradores.
  - `admin.css?v=101`.

- **2026-06-05** — **Seção Técnicos → Colaboradores**
  - Migration 048: `tecnicos.cargo TEXT NOT NULL DEFAULT 'tecnico'` — valores: `tecnico | adm | gestor | ti`.
  - Nav/seção renomeada de "Técnicos" para "Colaboradores".
  - Tabs de filtro alteradas para cargo (Todos / Técnico / Adm / Gestor / TI).
  - Modal agora tem campo "Cargo" (select); "Especialidade" renomeada para "Especialidade / Função".
  - Tabela: coluna Cargo substituiu Telefone+Chamados; Status (disponível/ocupado) mostra apenas para técnicos.
  - Detalhe: seção "Chamados" e botão "Marcar disponível/ocupado" visíveis só para técnicos.
  - KPIs: Total colaboradores | Técnicos | Técnicos disponíveis | Chamados em aberto.
  - Backend: `GET /tecnicos` inclui `cargo`; `POST` e `PATCH` aceitam e persistem `cargo`.
  - `admin.js?v=124`.
  - **Rodar migration:** `node scripts/migrate.js 048_colaboradores_cargo.sql`.

- **2026-06-05** — **RBAC 3 tipos de login no painel admin**
  - Adicionados roles `gerente` e `operador` ao sistema.
  - **Gerente**: acesso total ao painel (todas as seções, escrita habilitada), porém em Configurações enxerga apenas a aba "Conta" (sem acesso a Usuários, IA, Notificações, Operacional, SLA, Manutenção, Integrações).
  - **Operador**: acesso restrito a Monitor (Dashboard, Telemetria, Mapa, Alertas) + Chamados + Configurações → "Conta". Seções ocultas: Atendimento (exceto Chamados), O.S., Orçamentos, Planos, Clientes, Técnicos, Relatórios.
  - Role `admin_viewer` mantido para compatibilidade retroativa (viewer-only-hide).
  - Arquivos alterados: `src/middleware/adminOnly.js`, `src/routes/auth.routes.js`, `src/routes/admin.routes.js`, `src/routes/ordens-servico.routes.js`, `src/routes/relatorio.routes.js`, `public/login.js`, `public/admin.js?v=123`, `public/admin.html`.
  - Card de criação de acesso no painel (Clientes) agora tem select de role (Gerente / Operador / Visualizador legado) em vez de criar sempre `admin_viewer`.


- **2026-06-04** — **Envio de orçamento por e-mail ao cliente.**
  - Novo endpoint `POST /admin/orcamentos/avulsos/:id/enviar-email` — gera o PDF
    (`gerarPdfAvulso`), anexa e envia via Resend (`sendOrcamentoCliente` em
    `src/services/email.js`), marca o orçamento como `enviado` e grava
    `enviado_em`/`enviado_para` (migration 047).
  - Destinatário vem de `condominios.email` (cadastro do cliente), que agora aceita
    **múltiplos e-mails separados por vírgula** (normalização/validação no
    `condominios.routes.js`; coluna virou TEXT). O modal de envio pré-preenche com
    esses e-mails e permite editar antes de confirmar.
  - Admin — modal de orçamento: botão **"Enviar por e-mail"** no footer + overlay de
    confirmação. Versões: `admin.css?v=99`, `admin.js?v=122`.
  - **Remetente padrão** alterado de `telemetria@generalbombas.com` para
    `comercial@generalbombas.com` (`_emailFrom` em `email.js`; vale para todos os
    envios — atualizar `SMTP_FROM` no ambiente para o mesmo valor).


- **Fase 2** — IA com function calling (gpt-4o-mini) atendendo no WhatsApp.
- **Fase 3** — Painel admin "Mission Control": dashboard, mapa Leaflet,
  /alertas unificada, central WhatsApp estilo CRM.
- **Fase 4–5** — Integração telemetria↔chamado automática; gestão de conversas.
- **Fase 6** — Hardening (envs obrigatórias, RBAC) + configurações dinâmicas.
- **Fase 7** — App mobile Capacitor (técnico + cliente), O.S. digital, GPS.
- **Fase 8** — Analytics e SLA (métricas TTFR/TTR, dashboard).
- **Fase 9** — Política de retenção (jobs de cleanup).
- **Fase 10** — Curadoria de conversas (10A) → few-shot/fine-tuning (pendente).
- **Fase 11** — Política de criticidade P1–P4 + SLA de chegada.
- **2026-05-28** — Migração do gateway WhatsApp Evolution → **Meta Business API**
  (código pronto, pendente configuração); remoção do role `master_admin`;
  Puppeteer singleton; ambiente limpo para deploy.
- **2026-06-03** — **PDF de orçamento: correção de dois bugs**
  - `buscarDadosAvulso` agora usa `COALESCE(nome_fantasia, nome)` — o PDF exibia
    a razão social mesmo quando havia nome fantasia cadastrado (regressão pós-migration 044).
    Quando os dois campos diferem, a razão social aparece como subtítulo no PDF.
  - Puppeteer args em `orcamento-pdf.service.js` e `os-pdf.service.js`: adicionados
    `--disable-gpu` e `--no-zygote`. Com Puppeteer v22+ (novo headless Chrome), ausência
    de `--disable-gpu` em containers sem GPU (Railway) derrubava o processo do Chrome.

- **2026-06-03** — **Remoção da aba "Contatos" do modal de cliente**
  - A aba "Contatos" no modal de edição de condomínio era exclusiva para pré-cadastro
    de números WhatsApp. Como o módulo WhatsApp ainda não está ativo, a seção
    gerava confusão (texto "A IA vai pedir identificação" sem contexto real).
  - Removidos: tab + pane no `admin.html`, modal `wcOverlay`, ~150 linhas de JS
    (`_cliContatosWppCache`, `_wcAbrirModal/Salvar/Remover`, `_editRenderTabContatos`,
    handlers `novo/editar-contato-wpp`), e 4 rotas backend
    `GET/POST/PATCH/DELETE /admin/whatsapp/contatos`.
  - Tabela `clientes_whatsapp` preservada no banco para quando o WhatsApp for
    ativado.

- **2026-06-03** — **Mapa: migração de tiles CartoDB → OpenStreetMap**
  - `_criarTileLayer` em `public/admin.js` trocado de
    `basemaps.cartocdn.com/dark_all` para `tile.openstreetmap.org`.
  - Tema dark mantido via `className: "map-tiles-dark"` + regra CSS
    `filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%)`
    em `public/admin.css` — aplica só ao container de tiles (pane separado),
    marcadores e controles não são afetados.
  - Motivação: CartoDB retornava erros intermitentes (rate-limit silencioso em
    produção); o browser cacheava essas respostas de erro, causando mapa
    completamente em branco no F5. OSM é sem limites de taxa para uso normal
    e tem cobertura nativa até z=19.
  - Versões bumpeadas: `admin.css?v=81`, `admin.js?v=97`.

- **2026-06-02** — **Cadastro de clientes — Nome Fantasia e CNPJ persistido.**
  - Migration 044: coluna `nome_fantasia TEXT` em `condominios`.
  - Backend: `nome_fantasia` e `cnpj` incluídos em todos os endpoints
    (`POST /condominios`, `GET /condominios`, `GET /condominios/:id`,
    `PATCH /condominios/:id`) — antes o CNPJ era apenas buscado na BrasilAPI
    mas nunca gravado no banco.
  - Admin — modal "Novo cliente": redesenho em dois painéis horizontais
    (campos à esquerda em grid 2 colunas, mini-mapa à direita); modal
    ampliado para 1 100 px; campos Razão Social + Nome Fantasia lado a lado.
  - Admin — modal "Editar": campo "Razão Social" renomeado (era "Nome"); novo
    campo "Nome Fantasia"; `editCnpj` pré-preenchido com o valor salvo e
    incluído no payload do PATCH.
  - Painel lateral do cliente: CNPJ exibido formatado (`XX.XXX.XXX/XXXX-XX`)
    na seção Informações; nome fantasia como título principal com razão
    social como subtítulo quando ambos preenchidos; tabela e busca também
    usam `nome_fantasia` como nome primário.

- **2026-06-01** — **App mobile: camada visual HUD "Painel de comando"**
  (`app/public/app.css`, só mobile — não toca admin/site). Bloco aditivo no fim
  do CSS + 6 tokens `--hud-*` no `:root`. Grid técnico + scanline de fundo
  (estáticos), tipografia monospace nos dados
  (KPIs/timer/IDs/relógio), headers em uppercase tracked com tique âmbar,
  hairline nas barras, indicador de aba ativa no bottom-nav, linha de dados
  animada no login e anel de varredura no splash. Perf preservada (única
  animação contínua nova é cheap e desligada em `prefers-reduced-motion`).
  Reversível removendo o bloco + tokens.

> Decisões, itens descartados e backlog futuro:
> [`../memory-bank/decisions.md`](../memory-bank/decisions.md) e
> [`../memory-bank/roadmap.md`](../memory-bank/roadmap.md). Fluxos de negócio em
> [`modulos/`](modulos/README.md).
