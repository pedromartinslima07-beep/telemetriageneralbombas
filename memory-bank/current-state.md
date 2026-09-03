---
tags:
  - projeto
  - contexto/estado
aliases:
  - Estado Atual
---
# Estado Atual — Arquitetura, Módulos e Funcionalidades Prontas

## Arquitetura atual

```
ESP32 (sonda 4-20mA + SCT-013)
   │  HTTPS POST /telemetria  (X-Device-Key)
   ▼
┌─────────────────────────── Express (src/app.js) ───────────────────────────┐
│  Middleware: helmet (CSP p/ Leaflet+CEP) · compression · cors(env) ·        │
│              express.json(8mb p/ fotos base64) · cookieParser ·             │
│              static /static, /app, /uploads · _htmlNoCache nas HTMLs        │
│                                                                              │
│  Routers (19): auth · telemetria · alertas · condominios · reservatorios ·  │
│   cliente · relatorio · relatorios · admin · leituras · status · jobs ·     │
│   whatsapp · chamados · tecnicos · tecnicos-localizacao · ordens-servico ·  │
│   planos-manutencao · contratos                                              │
│                                                                              │
│  Services: alertas · email · ia · evolution(Meta API) · config ·            │
│   chamado-historico · chamado-mensagens · orcamento-pdf · os-pdf            │
│                                                                              │
│  Controllers: whatsapp.controller (webhook → background → IA)               │
│                                                                              │
│  Jobs (setTimeout recursivo, lêem config dinâmica a cada tick):             │
│   offline · planos-manutencao · gps-cleanup · leituras-cleanup ·            │
│   alertas-cleanup · conversas-cleanup · conversas-timeout                    │
│                                                                              │
│  Extras embutidos no app.js: proxy de tiles /tiles/:z/:x/:y.png (cache em   │
│   memória + dedupe inflight) · página /admin/reset-cache (limpa PWA) ·      │
│   handlers finais de 404 e de erro respondendo JSON (413/400 do body-parser)│
└──────────────────────────────────┬───────────────────────────────────────┘
                                    ▼
                              PostgreSQL (multi-tenant por condominio_id)
```

- **Bootstrap:** `server.js` carrega `.env` (só em dev) e sobe `app`. Graceful
  shutdown em SIGTERM/SIGINT fecha o pool `pg`.
- **Multi-tenancy:** `condominios` → `reservatorios` → `leituras` → `alertas`;
  isolamento aplicado por middleware (`authRequired` + guards por role).
- **Pipeline de telemetria** (`POST /telemetria`): valida device → auth por
  `X-Device-Key` → query única com `LEFT JOIN LATERAL` → conversão ADC→% por
  calibração → decisão da bomba por `limiar_bomba` → **write threshold** (só
  grava se Δ% ≥ threshold ou passou heartbeat) → CTE única (insert leitura +
  update last_seen + auto-resolve offline) → geração/resolução de alertas →
  nível baixo/muito baixo **novo** também abre chamado automático via
  `abrirChamadoAuto` (categoria `nivel_baixo`, P3/P2, dedup por
  condomínio+categoria — ver [chamados-sla.md](../docs/modulos/chamados-sla.md)).
- **Alertas de nível são estado, não histórico:** rodam em toda request (mesmo
  nas que o threshold não gravou), o nível vigente sai dos **alertas abertos**
  do device — nunca da última leitura gravada — e sair de faixa exige histerese
  de 5 pontos (`TELEMETRIA_HISTERESE_PCT`). Na página de Alertas o alerta de
  telemetria e o chamado `[AUTO]` do mesmo evento aparecem **como um item só**.
  Ver [telemetria.md](../docs/modulos/telemetria.md).

## Módulos existentes (por router)

| Módulo | Responsabilidade |
|---|---|
| **auth** | Login identifier-first: e-mail → `/auth/metodo` diz o campo seguinte (senha da equipe ou código do cliente) → OTP → JWT + trusted device cookie |
| **telemetria** | Ingestão de leituras dos ESP32 |
| **condominios / reservatorios** | CRUD + calibração + limiar + lat/lng/CEP/CNPJ/nome_fantasia |
| **cliente** | Status e histórico do próprio condomínio |
| **alertas** | Página unificada telemetria+chamados, comentários, análise IA |
| **whatsapp** | Webhook Meta, conversas, central de atendimento, curadoria IA (contatos WhatsApp removidos da UI até módulo ser ativado) |
| **chamados** | Ciclo do chamado, P1–P4, SLA, recorrência, a-caminho/chegou |
| **tecnicos / tecnicos-localizacao** | Cadastro técnicos + GPS + ETA. A **janela de expediente** (`gps.expediente_*`, default 8–18, fuso `America/Sao_Paulo`) é aplicada **no backend**: fora dela o POST não grava e o GET devolve `[]`. App e serviço Java também a aplicam, mas só o backend é fonte da verdade — ver [app-mobile.md](../docs/modulos/app-mobile.md) |
| **ordens-servico** | O.S. digital (fotos, assinatura, orçamento) + PDF. Fotos persistidas em `os_fotos.dados_base64` (banco), servidas via `GET /ordens-servico/:osId/fotos/:fotoId/imagem` — não dependem mais de disco efêmero. ⚠️ **A assinatura vem em duas chamadas:** `GET /:id` traz só `tem_assinatura`; a imagem (~120KB) sai por `GET /:id/assinatura`. Ler `assinatura_b64` do detalhe dá `undefined` — foi o que fez o admin mostrar "Não assinada." em O.S. assinada até 02/09/2026 |
| **planos-manutencao** | Planos preventivos recorrentes |
| **contratos** | Contratos por condomínio. Assinatura eletrônica própria por link de e-mail (sem ZapSign/D4Sign — ver `decisions.md`): exige código de 6 dígitos antes de assinar (2FA equivalente ao login) e grava um protocolo (hash SHA-256 auditável) impresso no PDF junto com IP e data/hora |
| **orçamentos** | Sistema unificado (tabela `orcamentos` + `orcamento_linhas`); `tipo` (060) ramifica o PDF avulso entre tabela de peças (padrão) e layout descritivo por cláusulas para limpeza de reservatório/dedetização/combo, mesmo timbrado. Item sem `valor_unitario` some da coluna de valor no PDF em vez de virar "R$ 0,00"; `orcamentos.valor` serve de override manual do total (062) e, quando preenchido, **remove do PDF as colunas Valor Unit./Total por item** — só o box VALOR TOTAL aparece |
| **relatorio / relatorios** | PDF de telemetria (Puppeteer) pro cliente/app; painel ao vivo (chamados em risco + workload) e exportação CSV de chamados/alertas/telemetria pro admin |
| **equipamentos** | Identidade permanente de bomba/motor/painel + etiqueta QR (migration 070). Guard próprio `equipeInterna` (inclui **técnico**, que não passa em `adminOnly`). Ficha em `/e/:codigo`, folha A4 de etiquetas via Puppeteer + `qrcode`. Fluxo em [equipamentos.md](../docs/modulos/equipamentos.md) |
| **admin** | Usuários, status agregado, histórico, geocode, configurações |
| **status / leituras / jobs** | Endpoints auxiliares e disparo manual de jobs |
| **leads** | Contatos da landing pública. `POST /leads` é público (rate limit + honeypot `site` + truncagem); leitura e funil exigem `gestaoOnly`. Fluxo em [landing-publica.md](../docs/modulos/landing-publica.md) |

### ⚠️ Onde chega o "preciso de orçamento" do técnico (02/09/2026)

O app grava `orcamento_necessario` + `orcamento_observacoes` na O.S. Daí a
informação aparece **só no admin**, em quatro lugares: a aba "Solicitados
pelos técnicos" (o destino de verdade), o drawer do condomínio, o detalhe da
O.S. e a ficha do equipamento.

**Não dispara notificação nenhuma** — nem e-mail, nem WhatsApp, nem alerta —,
**não sai no PDF da O.S.**, não chega ao operador (a tela Aprovados só lista
`status = 'aprovado'`) e não chega ao cliente. Se ninguém abrir a aba, o pedido
fica parado sem sinal. O badge da barra lateral hoje conta **solicitado +
rascunho** e é carregado no boot; até 02/09 não contava o pedido novo e só
existia depois de alguém entrar na seção.

Detalhe em [painel-admin.md](../docs/modulos/painel-admin.md).

⚠️ **Existe UM modal de orçamento** (02/09/2026): o de `#avModal`, da aba
"Criar orçamento". A aba "Solicitados pelos técnicos" é lista; o clique abre
aquele modal — e o pedido ainda SOLICITADO ganha a linha em `orcamentos` na
abertura. O segundo modal, que refazia o mesmo documento com menos recursos
(sem envio por e-mail, sem tipo), foi removido: −525 linhas.

⚠️ **Quem tira o pedido da fila é a lixeira da linha** (03/09/2026), não o
"Excluir orçamento" do modal. A linha é a **O.S. com a flag ligada**; aquele
botão apaga o documento e a linha volta como SOLICITADO — e clicar nela de novo
cria outro rascunho. `DELETE /admin/orcamentos/:os_id` desliga a flag e apaga o
orçamento daquela O.S. numa statement só. **O avulso sem `os_id` não é tocado**:
orçamento que o cliente já recebeu não se apaga para limpar fila.

### ⚠️ O que liga um orçamento ao serviço que o executou (03/09/2026)

Duas pernas, e as duas precisam existir: `chamados.orcamento_id` (079) e
`ordens_servico.chamado_id`. **`orcamentos.os_id` NÃO é isso** — é a O.S. de
ORIGEM, aquela em que o técnico pediu o orçamento, e nada a preenche na
conclusão.

Até 03/09 só a rota do painel do operador escrevia a primeira perna, e o
chamado aberto pelo modal do admin — o caminho normal — nascia sem vínculo: o
serviço acontecia e o orçamento seguia em "Aprovados" dizendo "Pode executar".
Hoje `POST /chamados` aceita `orcamento_id`, e a tela de Aprovados percorre as
duas pernas até a O.S. (`exec_os_*`).

⚠️ **Sobra um buraco que nenhum código fecha:** serviço feito sem chamado
apontando o orçamento (esquecimento no modal, ou o técnico já estava no
prédio). Para esses continua valendo o "Já foi feito" manual — mas aí é
exceção, não a regra.

⚠️ **O operador LÊ O.S. desde 03/09/2026, e não escreve.** O RBAC de 27/08
deixava toda O.S. fora do alcance dele, e isso furou quando a placa passou a
nomear a O.S. que executou: ele via o número e tomava 403 ao abrir. A linha em
`osDonoOuAdmin` é o `forWrite` — editar é do técnico que esteve no prédio.

### ⚠️ Escolher prédio é campo de BUSCA, não `<select>` (02/09/2026)

`public/condo-picker.js` — arquivo **compartilhado** por `admin.html` e
`operador.html`, no molde do `inatividade.js`. Busca em fantasia, razão social,
bairro e cidade, sem acento e sem caixa. Hoje só no "Novo chamado" das duas
telas; os outros seis selects de condomínio do admin seguem nativos e podem
adotá-lo (o campo original vira hidden com o mesmo id — nada de gravação muda).

⚠️ **Tudo o que o componente guarda "no campo" mora no HIDDEN** (corrigido em
03/09/2026). Depois de `montar`, `getElementById(campoId)` devolve o hidden, e
não o elemento original — que perdeu o id. Guardar a marca de "já montado" no
original fazia o admin empilhar um picker por abertura do modal ("está
aparecendo 3 seletores"), porque lá o HTML do modal é fixo e `montar` roda de
novo sobre o mesmo elemento. Quem for adotar o componente nos outros seis
selects cai no mesmo caso.

⚠️ **No admin as regras da lista são `.cbx-lista .cbx-item .cbx-nome`/`.cbx-sub`
de propósito**: o campo mora num `<label class="f">`, e `.f span` é descendente
— ele pintava os dois de rótulo (caixa alta, 700, 11px), deixando nome de porta
e razão social idênticos. Terceira vez desse seletor.

Para olhar sem entrar no painel: **`/dev/_novo-chamado-preview.html`**, que
recorta o `#novoChamadoOverlay` do `/admin/painel` servido na hora, com o
`admin.css` real. ⚠️ O `<script>` de prévia tem de ser externo — helmet com
`script-src 'self'` não executa inline e não avisa.

Teste: `scripts/testes/condo-picker.test.js` (16 checagens). ⚠️ O
`getElementById` do DOM falso **procura pelo id de verdade** — o atalho que
devolvia o original sempre foi o que deixou esse bug passar. E ⚠️ **teste sem
navegador não vê aparência**: o atropelo do `.f span` passou inteiro por ele.

### ⚠️ Qual nome de condomínio cada tela mostra (02/09/2026)

`condominios` guarda **dois** nomes: `nome` é a **razão social** (obrigatória,
a do CNPJ) e `nome_fantasia` é o **nome de exibição** (opcional, migration
044). Em produção **71 dos 86** cadastros têm os dois diferentes.

A regra, valendo em orçamentos desde 02/09: **fantasia na tela e no topo do
PDF, razão social logo abaixo quando difere**, e a busca aceita os dois. A
expressão canônica é `COALESCE(NULLIF(c.nome_fantasia,''), c.nome)` — o
`NULLIF` porque fantasia salvo como string vazia apagaria o nome.

⚠️ **O resto do sistema ainda não segue.** Chamados, O.S., contratos,
relatórios, WhatsApp e alertas leem `c.nome` puro, então mostram a razão
social. Não é decisão, é a migration 044 aplicada pela metade — quem mexer
nessas rotas deveria alinhá-las. Já alinhados: orçamentos (as duas abas), PDF
de orçamento, e-mail de envio, painel do cliente, equipamentos, planos de
manutenção e o select de condomínios.

Detalhe em [painel-admin.md](../docs/modulos/painel-admin.md).

### ⚠️ O painel do operador é a tela de PLANTÃO (02/09/2026)

Três regras que só valem lá, e as três vêm do mesmo fato: a tela fica **aberta**
o turno inteiro, com o mapa em tela cheia.

- **Não desconecta por inatividade** — `<body data-corte="nunca">`, lido pelo
  `inatividade.js`. O carimbo `tg_ultima_atividade` continua sendo gravado (é
  compartilhado com as outras telas); só o corte é dispensado. Vale para o
  `/operador/painel`, não para a tela de Aprovados.
- **Em tela cheia o ciclo de 30s não reescreve o `#tela`** — o nó do mapa mora
  dentro dele, e tirar do documento o elemento em tela cheia encerra a tela
  cheia. O `#tela` é reposto na saída.
- **O clique no pino segue o estado do chamado** — sem técnico abre o despacho,
  com técnico abre o balão. Antes abria o despacho sempre, e reatribuir era um
  clique sem aviso.

Detalhe e o porquê de cada uma em
[painel-operador.md](../docs/modulos/painel-operador.md).

## Funcionalidades prontas (✅)

**Telemetria & alertas**
- Ingestão ESP32 com write-threshold e auto-resolve de offline.
- Job offline (alerta após N min sem leitura, idempotente).
- Seção **Telemetria avançada** (5 KPIs, bar chart de níveis, críticos, status
  das bombas, histórico 24h/3d/7d com export PDF).
- Página **/alertas unificada** (telemetria + chamados): KPIs clicáveis, tabela
  unificada, painel lateral com gauge/histórico, ações recomendadas hardcoded,
  **análise IA sob demanda**, comentários.

**Painel admin — sistema "Chapa", registro de operação** (migrado em 20–21/08/2026)
- As 15 telas usam o mesmo sistema visual da landing, do login e do painel do
  cliente: marinho como material, `#fbb329` institucional, chanfro de 45°,
  Archivo + Martian Mono. O "Mission Control" (âmbar `#f0b014`, aurora, vidro)
  **não existe mais** — regras e fronteiras em [`../DESIGN.md`](../DESIGN.md).
- **Placa clara é o que abre por cima** (modal, drawer); o que fica lado a lado
  com o conteúdo é superfície de trabalho e continua marinho.
- **Selo de estado:** preenchido pede ação, de fio em repouso — e só uma
  dimensão preenche por linha (prioridade x status, severidade x status).
- **Paleta de gráfico:** três slots em ordem fixa, com degrau próprio para
  campo escuro e claro. O teto de três é medido, não estilístico.
- ⚠️ O **app do técnico** (`app/public/app.css`) não migrou e mantém
  `--accent: #f0b014` — quarta identidade, dívida conhecida.
- Sidebar colapsável, topbar, mission control grid, feed em tempo real.
- **A nav da sidebar cabe inteira na tela** (24/08/2026): as faixas de
  `@media (max-height)` foram recalculadas por medição (Puppeteer varrendo
  de 1 em 1px, confirmado no Chrome real). Com os 15 itens visíveis a nav
  não rola acima de 598px de viewport. São **oito degraus de densidade**, e
  a granularidade fina é o ponto: com faixas largas, quem estava em 889px
  levava o aperto calculado para 801px e sobravam ~139px de vão morto no pé
  da lista. Os rótulos de seção são texto (8.8px mono) em todas as faixas
  menos a mais apertada (614–700px, notebook com barra de tarefas), onde
  viram filete de 1px. Ver [decisions.md](decisions.md).
- **Mapa interativo Leaflet** (tiles OpenStreetMap + filtro CSS dark): pinos por
  status, painel lateral com tabs, KPIs, donuts, classificação por zona de SP.
- Cadastro de coordenadas com **geocoding híbrido** (ViaCEP + AwesomeAPI +
  BrasilAPI + Nominatim) e reverse geocode ao arrastar o pino. A coordenada da
  BrasilAPI só vale quando o `service` da resposta não é `open-cep` — esse
  provider devolve o centroide do município e jogava todo pino no centro da
  cidade (25/08/2026). Ver
  [../docs/modulos/mapa-geocoding.md](../docs/modulos/mapa-geocoding.md).
- Polling independente por tipo (telemetria 7s / chamados+WhatsApp 20s), badges
  de notificação que somem ao entrar na seção.

**WhatsApp + IA (central de atendimento)**
- Webhook Meta (formato `entry[].changes[].value.messages[]`) + verificação GET.
- Processamento em background (responde 200 imediato), idempotência por
  message_id, segurança por verify token.
- **IA com function calling** (gpt-4o-mini): busca telemetria, abre chamados,
  vincula condomínio, busca status do técnico (ETA via GPS+Haversine).
- **Contexto operacional pré-injetado** (telemetria/alertas/chamados) antes de
  cada chamada à OpenAI.
- **State machine** (triagem → aguardando_confirmação → chamado_aberto /
  escalado / finalizado) + **anti-loop** (3 trocas sem avanço → escala humano).
- Central CRM 3 colunas: lista/chat/info, assumir conversa (IA cala), envio
  manual, IA assistiva (resumir / sugerir resposta), fechar/reabrir/apagar.
- **Timeout de sessão** (8h, configurável) → fecha + pede avaliação 1–4 no
  WhatsApp → alimenta curadoria.
- **Curadoria** (Migration 038): qualidade do atendimento + export NDJSON com
  PII scrubbing para futuro fine-tuning.

**Chamados, SLA e O.S.**
- Criticidade **P1–P4** com SLA de chegada do técnico, regra de recorrência
  (mesma falha no mês sobe 1 nível), endpoints `/a-caminho` e `/chegou`.
- **SLA configurável** + métricas TTFR/TTR (`primeira_resposta_em`,
  `tempo_resolucao_seg`) + **painel ao vivo** de chamados em risco/workload
  na aba Relatórios; análise histórica de SLA é feita via export CSV.
  O TTFR é marcado por qualquer primeiro toque da equipe — atribuir técnico ou
  responsável, mudar status, mensagem/comentário, iniciar atendimento ou chegar
  (lista completa em [chamados-sla.md](../docs/modulos/chamados-sla.md)).
- **O.S. digital** completa (fotos base64 comprimidas, assinatura, orçamento) +
  PDF via Puppeteer; página de O.S. no admin.
- Histórico de chamados, mensagens do chamado, avaliação.
- **Orçamentos unificados** (Migration 030) + encaminhamento via IA por email.
  **Envio do orçamento ao cliente por e-mail** (PDF anexo via Resend, botão no modal;
  destinatário de `condominios.email` — múltiplos por vírgula; marca `enviado` +
  `enviado_em/enviado_para`, migration 047). Remetente: `comercial@generalbombas.com`.
  **Dois formatos desde 27/08/2026**, escolhidos pelo `modo` no modal — e são
  dois templates de verdade em `sendOrcamentoCliente`, não um com peças
  opcionais (ver [../docs/modulos/orcamentos-envio.md](../docs/modulos/orcamentos-envio.md)):
  - **`painel`** → estruturado, com a identidade da casa: faixa marinho com o
    logo embutido, etiqueta "Orçamento comercial", caixa com Número/Cliente/
    Data/Válido até (sem o valor — ele fica no PDF), botão para o painel e
    rodapé de contato. Corpo fixo, vai só para quem tem login, sem anexo. ~31 KB.
  - **`carta`** → **o texto escrito pelo operador e a imagem da assinatura
    dele, e nada mais.** Sem faixa, sem caixa de informações, sem fecho da casa,
    sem rodapé. Vai para os endereços digitados, com o PDF anexo e sem link.
    621 bytes.

  Até 27/08 o HTML era **um só**, o estruturado, e a carta saía embrulhada nele
  — com a caixa repetindo o que a carta já dizia e a assinatura pessoal
  ensanduichada num "Atenciosamente / General Bombas" que o operador não
  escreveu. O modo separava as entradas; não separava a forma.

  As rotas `/admin/me/email-template` e `/admin/me/assinatura` e as colunas
  `usuarios.email_mensagem` / `assinatura_blob` alimentam o modo `carta` — elas
  ficaram sem chamador entre 24 e 25/08, mas nunca foram removidas.
  O logo vai como data URI reduzido (`public/logo-email.png`, 20 KB, gerado por
  `scripts/gerar-logo-email.js`): o original de 68 KB vira 91 KB em base64 e o
  Gmail apara a mensagem acima de ~102 KB de corpo — o anexo não conta nesse
  limite, o data URI conta.
- Planos de manutenção preventiva + contratos. Na aba Planos, seleção múltipla
  (checkbox por linha + "todos" no cabeçalho) com **edição em massa** de
  periodicidade / próxima execução / status via `PATCH /planos-manutencao/bulk`.

**Equipamentos e etiqueta QR (Fase 12A)** — `migrations/070`,
`src/routes/equipamentos.routes.js`, `src/services/etiquetas-pdf.service.js`,
`public/equipamento.{html,css,js}`
- Etiqueta **permanente do equipamento** (não da passagem pela oficina) e que
  **nasce em branco** — a bomba chega antes do cadastro existir, então o vínculo
  com o condomínio acontece no ato da retirada, com a bomba na mão.
- Código do QR é **aleatório** (base32 Crockford, 8 caracteres, sem I/L/O/U): a
  ficha revela endereço de cliente, e URL sequencial exporia o parque inteiro.
- **Sem plugin de scanner** — a câmera nativa do Android abre a URL. Mexer no
  build Android competiria com o prazo de 31/08 da Play Store.
- Folha A4 em dois formatos (papel comum com marcas de corte · Pimaco 6180).
  ⚠️ O gerador **recusa** QR com host local — etiqueta é física e permanente.
  Depende de `PUBLIC_BASE_URL` nas envs.
- ⚠️ **A foto usa rota autenticada** (`fetch` + object URL), diferente da
  equivalente em `os_fotos`, que é pública: aqui o id é sequencial e o conteúdo
  é o interior da casa de máquinas de um cliente.
- Migration 070 aplicada em **teste e produção** (2026-08-17).
- Diagnóstico, peças, orçamento e painel da bancada são Fase 12B.

**App mobile (Capacitor 8)** — `app/public/`
- **Capacitor 8.4.2** desde 2026-07-28 (`targetSdk 36`, `minSdk 24`, AGP 8.13.0,
  Gradle 8.14.3, Java 21) — piso exigido pela Play Store a partir de 31/08/2026.
  Requisitos de build em [app-mobile.md](../docs/modulos/app-mobile.md).
- Telas técnico: chamados, detalhe, O.S., conta; ciclo com GPS.
- **A O.S. do app aponta a bomba etiquetada** (31/08/2026): seção "Bomba
  atendida" grava `ordens_servico.equipamento_id`, o campo que o modal do admin
  já tinha desde 18/08 e que faltava justamente em quem escreve a O.S. no
  campo. Só é renderizada se o condomínio tiver equipamento cadastrado — com
  `equipamentos` zerada em produção, hoje ela não aparece para ninguém e nasce
  sozinha quando as etiquetas subirem. Pegadinhas em
  [app-mobile.md](../docs/modulos/app-mobile.md).
- **O app do técnico está migrando para o Chapa** (01/09/2026) — **as quatro etapas**. `app/public/tecnico.css` remapeia os tokens do `:root` (o app inteiro
  muda de paleta: marinho como material, amarelo institucional `#fbb329`, raio
  zero, sombra nenhuma) e recompõe a **lista de chamados**. Detalhe do chamado, O.S., Conta e Roteiro foram recompostos na mesma sessão. As telas `cliente-*` do app ficaram fora do escopo — o
  Pedro confirmou que não existem em uso.
  - Três defeitos estruturais corrigidos no item, nenhum de paleta: saiu a
    barra colorida de 3px ("side-tab"); a **prioridade virou texto** (existia
    só como cor); e **só a prioridade preenche** — categoria virou etiqueta
    gravada, status virou selo de fio.
    - ⚠️ **A placa é CLARA** — `--chapa` sobre o campo marinho, como o `.orc-item`
    do painel do cliente. A primeira versão montou placa escura sobre escuro; o
    Pedro corrigiu mandando a tela de orçamentos como referência ("campos
    brancos, palavras em amarelo"). A placa **redeclara os tokens de tinta**
    localmente; fundo de selo usa o token cru, texto usa o semântico.
  - **Uma palavra em amarelo por tela**, e só sobre marinho. Na lista ela vive
    no estado vazio ("Você está **em dia**").
  - **Emoji não faz papel de ícone**: saíram os das ordenações, do desvio do
    Roteiro e do confirmar assinatura.
  - O placar de 4 números saiu da lista (dois repetiam as abas). **Não saiu do
    Roteiro**, onde os números são outros e não se repetem.
  - ⚠️ Ao recompor as próximas telas, **remova os blocos superados do
    `app.css`** em vez de sobrescrever: três regras antigas venceram a folha
    nova em silêncio nesta sessão. Detalhe em
    [app-mobile.md](../docs/modulos/app-mobile.md).
- **A O.S. sobrevive à falta de sinal — campos, FOTOS e ASSINATURA**
  (01/09/2026, etapas 1 e 2). Dois armazéns por durabilidade: `localStorage`
  para os campos (escrita **síncrona** — o Android mata o app sem avisar) e
  **IndexedDB** (`gb_os`) para assinatura e fotos (cabe muito mais que os ~5 MB).
  A foto tirada sem sinal entra na fila e **aparece na tela marcada como "na
  fila"** — escondê-la faria o técnico fotografar de novo e duplicar. Sobem uma
  a uma quando a rede volta (o corpo do POST é base64 e o `express.json` corta
  em 8 MB). `finalizarOS` descarrega a fila antes de fechar e **barra** se
  sobrar foto. ✅ **FINALIZAR também funciona sem sinal** (etapa 3, migration 081): o app manda
  o horário em que o técnico terminou, e o backend usa esse instante na O.S. **e
  no chamado** — com `NOW()`, as horas sem sinal entrariam no `tempo_resolucao_seg`
  (o SLA) como tempo de atendimento. ✅ **Migration 081 aplicada em teste e em produção** (01/09), antes do deploy do
  código — a ordem que a Fase 7E ensinou.
  ⚠️ Falta de sinal é estado âmbar, não alerta vermelho; vermelho ficou para
  recusa do servidor (`err.httpStatus` separa os dois).
- (histórico) **A etapa 1 (01/09/2026):** O patch
  pendente é gravado em `localStorage` por id de O.S. antes de tentar a rede, e
  volta para a fila quando o envio falha (antes era descartado, e o que o
  técnico digitava vivia só em memória — sair da tela perdia tudo). Reabrir
  aplica o rascunho por cima do `GET` e reenvia sozinho. ⚠️ **Fotos, envio da
  assinatura e FINALIZAR continuam exigindo rede** — são as etapas 2 e 3.
  ⚠️ Falta de sinal virou estado âmbar, não alerta vermelho; vermelho ficou
  reservado para recusa do servidor (`err.httpStatus` no `api()` separa os
  dois). Detalhe em [app-mobile.md](../docs/modulos/app-mobile.md).
- **O app abre sem sinal** (01/09/2026, etapa 4). Lista, detalhe do chamado,
  O.S. e equipamentos saem do cache do IndexedDB, **pré-carregado** enquanto há
  rede — cachear só o que já foi aberto não resolveria o caso real, que é abrir
  no subsolo a O.S. ainda não aberta. Só falha de REDE cai para o cache (um 403
  é resposta legítima). ⚠️ **Não cobre iniciar um atendimento novo**: a O.S.
  nasce de um `POST`. ⚠️ Ao acrescentar store no IndexedDB, **bumpe
  `IDB_VERSAO`** — sem isso quem já abriu o app não ganha o store e a falha é
  silenciosa.
- **A marca do cabeçalho do app é o wordmark** (`logo-topo.png`), não o lockup
  com assinatura — a 26px a assinatura vira borrão. Mesma escolha do operador.
- **A tela de fim de O.S. só oferece "Voltar pra minha lista"** (01/09/2026).
  Saíram o botão "Baixar PDF" (pedido do Pedro) e a barra "Confirmar e
  finalizar O.S.", que continuava na tela de uma O.S. **já finalizada** e só
  produzia erro ao ser tocada — `mostrarOSSucesso()` escondia a `.td-cta-bar`
  errada (há duas no `index.html`, e a do detalhe do chamado vem antes). Junto,
  um defeito que ninguém tinha relatado: o card do timer/progresso era escondido
  e **nunca restaurado**, então sumia de toda O.S. seguinte até reabrir o app.
  O restauro passou para `abrirFormularioOS()` — na **entrada**, porque a seta
  `#osBack` é uma segunda porta de saída. Detalhe em
  [app-mobile.md](../docs/modulos/app-mobile.md).
- ⚠️ **Toda mudança no `app/public/` só chega ao técnico com APK novo**
  (`npm run build:apk` + reinstalar): o web é empacotado no bundle, não servido.
  Vale agrupar mudanças antes de gerar build.
- Telas cliente/síndico: home, telemetria, chamados (KPIs clicáveis), conta,
  suporte, novo chamado, detalhe.
- Auth + onboarding; rastreamento GPS; herda visual do admin.
- **As telas de entrada do app estão no mundo "Chapa"** (01/09/2026). Splash,
  login e código deixaram o cartão escuro âmbar e viraram o mesmo visual do
  `/login` do site: faixa da marca com a foto dos reservatórios, placa clara
  chanfrada, Archivo + Martian Mono, amarelo institucional `#fbb329`. Estilo em
  `app/public/login.css` (arquivo próprio, escopado em `.screen-auth`); os
  blocos de auth saíram do `app.css`. **O app agora abre no Chapa e troca para
  o Mission Control âmbar ao entrar** — a emenda é consequência aceita de
  portar só o login.
  - ⚠️ **O mecanismo NÃO foi portado, por decisão do Pedro:** continua e-mail +
    senha juntos no `POST /auth/login`, e não o passo a passo do PWA
    (`/auth/metodo` → senha ou `/auth/codigo`). **O app não chama
    `/auth/codigo`**, então quem não tem senha — o síndico — não entra por ele.
    Hoje não atinge ninguém (produção sem usuário `cliente`), mas abre no dia
    em que o primeiro for cadastrado.
  - ⚠️ Isto **substitui** a nota de jul/2026 que dizia "login e OTP são só logo
    + formulário, e as duas telas deixaram de ser espelhadas de propósito".
    Voltaram a ser espelhadas — no visual, não no fluxo.
  - Pegadinhas (sem `color-mix`, caminhos relativos, `:active` no varrimento) em
    [app-mobile.md](../docs/modulos/app-mobile.md).
- **Camada visual HUD "Painel de comando"** (jun/2026): grid técnico + scanline
  de fundo, dados em monospace, headers
  uppercase tracked, indicador de aba no bottom-nav. Bloco aditivo no fim de
  `app/public/app.css` + tokens `--hud-*`; só mobile, não afeta admin/site.
  - ⚠️ **Os dois itens de auth dessa camada saíram em 01/09/2026** (o filete de
    "fluxo de dados" no topo do cartão de login e o anel de varredura no
    splash), junto com o cartão que eles vestiam. O HUD segue inteiro nas telas
    do técnico — só não alcança mais splash, login e código.

- **Toolbars do admin quebram linha** (ago/2026): `.cardHead`, `.wa-tabs` e
  `.mp-tabs` têm `flex-wrap: wrap`. Antes só quebravam em `max-width: 768px` e,
  entre ~1280px e 1536px, o `overflow: hidden` do `.card` **recortava
  controles inteiros sem deixar scroll** — o "+ Novo" da telemetria era o caso
  visível. Ao acrescentar filtro/botão numa toolbar, confira em 1366px: é a
  largura de notebook onde a folga acaba primeiro. Medição em
  [changelog.md](../docs/changelog.md) (2026-08-05).

- **Duas cascas de modal, não uma** (ago/2026). Ao criar ou reformar um modal
  do admin, escolha antes de escrever markup:
  - **`.modalBox`** (padrão) — `.modalHead` / `.modalBody` que rola inteiro /
    `.modalFoot`. Serve pra tabela, detalhe e formulário curto.
  - **`.modalBox.is-split`** — janela de **altura fixa** com `.modal-split`
    (grid), `.modal-split-form` (rola) e `.modal-rail` (fixo, 360px). Para
    formulário longo que tem algo que não pode sair da vista: o total no
    orçamento, o mapa e o "Salvar" no Editar condomínio. Colapsa em coluna
    única abaixo de 1080px.
  - ⚠️ **Todo wrapper entre `.modalBody` e `.modal-split` precisa repassar o
    flex** (`flex: 1; min-height: 0; display: flex`), senão o formulário vaza
    pra fora da janela. Já mordeu duas vezes: `#avModalBody` no orçamento e
    `.edit-tab-pane` no Editar condomínio.
  - Rótulo de campo tem gramática própria: `.modal-sec-title` (seção),
    `.f span em` (dica dentro do rótulo), `.f span b` (asterisco de
    obrigatório), `.modalFoot-danger` (ação destrutiva sem cara de botão).

- **Nas telas master-detail (`.ch-layout`), quem rola é o `.content`, não a
  lista** (ago/2026). `.ch-list-col .tableWrap` tem `overflow-y: auto`, mas
  `.ch-list-col` é `align-self: stretch` numa linha de altura automática —
  nada limita a altura dele, então o `auto` nunca engata e a página inteira
  rola. Por isso o painel de detalhe é `position: sticky; top: 0` com teto de
  viewport: sem isso ele saía da tela junto com a rolagem da lista. Vale para
  Alertas, Clientes, Chamados, Orçamentos (2 modos) e Colaboradores.
  Se um dia a lista precisar rolar por dentro, é a altura da coluna esquerda
  que muda — e isso mexe nas 5 telas de uma vez.

- **Gráfico dentro de contêiner rolável precisa de `overflow-x: hidden`**
  (ago/2026). `overflow-y: auto` sozinho **também** torna o eixo X rolável — a
  regra do CSS diz que, quando um eixo não é `visible`, o outro computa de
  `visible` para `auto`. Os overlays do ApexCharts (`.apexcharts-xaxistooltip`
  em especial) são posicionados no cursor e vazam nas bordas: bastam 5px pra
  abrir uma barra de rolagem, que come altura, que redimensiona o gráfico
  (`height: "100%"`), que perde o hover — e o modal treme. Diagnóstico completo
  em [changelog.md](../docs/changelog.md) (2026-08-06).
  ⚠️ Não feche o eixo Y junto: o canvas do Apex é ~47px mais alto que o
  contêiner com `height: "100%"`, e é a rolagem vertical que mantém a linha de
  datas alcançável.

**Landing pública** — `public/index.html` + `landing.css` + `landing.js`
- Rota `/` é a página de apresentação para síndicos (não é mais redirect para
  `/login`). Formulário posta em `POST /leads`; o funil é lido no admin.
- Sistema visual **próprio**, chamado "Chapa" — derivado do chanfro do wordmark
  da General. **Não compartilha nada com `admin.css`** e não deve passar a
  compartilhar: o admin é ferramenta de operação, a landing é peça de venda.
- Fontes auto-hospedadas (Archivo variável + Martian Mono) em `public/fonts/`,
  porque a CSP `script-src 'self'` do helmet não permite CDN.
- ⚠️ **Não registra service worker**, de propósito. Mas o `?v=N` de
  `landing.css`/`landing.js` continua valendo.
- ⚠️ O painel do hero é **demonstração com dados simulados** e diz isso na
  própria placa. As faixas 45% / 20% são as mesmas do backend — se mudarem lá,
  mudam aqui. Detalhe e demais pegadinhas em
  [landing-publica.md](../docs/modulos/landing-publica.md).
- ⚠️ **Toda a copy é primeira pessoa do plural** ("Monitoramos", "a gente
  sabe"). Terceira pessoa ("A General monitora") faz a página soar como um
  terceiro apresentando a empresa — ver [decisions.md](decisions.md).
- ⚠️ A seção `#servico` (`.vigia`) é **uma placa dividida por cortes
  gravados**, não três cards. Substituiu a linha do tempo da madrugada em
  2026-08-13.

**Painel do operador** — `public/operador.html` + `operador.css` + `operador.js`

Implementado em 2026-08-27 a partir da comp
[`../docs/comps/painel-operador-v2.html`](../docs/comps/painel-operador-v2.html).
Fluxo e pegadinhas em
[painel-operador.md](../docs/modulos/painel-operador.md).

- **A tese é a fila do turno**, ordenada pelo **SLA que estoura primeiro** — não
  por data (a lista do admin) nem por prioridade. É a única diferença que
  justifica a tela existir.
- **A evidência mora dentro do item**: colunas d'água quando há telemetria, a
  fala de quem relatou quando não há. Prédio sem sensor não é item pobre — é
  item com outra prova. Foi o que derrubou a v1 ("parede de instrumentos"), que
  não tinha o que desenhar para metade da carteira.
- **Folha própria em "Chapa" de operação** (marinho, chanfro de 45°, mono só em
  medição, amarelo na única ação). **Não carrega `admin.css` nem importa nada de
  `admin.js`** — a lição do painel do cliente, que virou refém do admin até
  13/08.
- **Um endpoint** (`GET /operador/fila`) monta a tela inteira, com o SLA
  resolvido no **relógio do servidor**. Recarga a cada 30s por `setTimeout`
  recursivo, com pulso que fica vermelho após 3 ciclos sem sucesso.
- **O chamado pode nascer já despachado** (31/08): os dois diálogos de criação
  — o "Novo chamado" da fila e o "Abrir chamado" dos Aprovados — têm seletor de
  **técnico opcional**, com padrão "Despachar depois". Quem valida é o
  `chamado-atribuicao.service.js` (ativo + cargo técnico), atribuir marca o
  `primeira_resposta_em` e o status continua `aberto` — `em_atendimento` segue
  sendo só do app do técnico. ⚠️ A tela de Aprovados busca a equipe em
  **`GET /operador/tecnicos`**, e não em `GET /tecnicos`: aquele devolve CPF,
  RG e endereço porque serve o cadastro do admin.
- **A barra do turno segue a gramática das irmãs** (31/08 e 03/09): navegação é
  texto (**Aprovados · Ajuda**), a ação é âmbar (**+ Novo chamado**), e o canto
  direito é **o nome de quem está logado como botão**, que abre a gaveta de
  conta (trocar senha · sair). Em 03/09 isso revogou a regra "o nome é texto"
  herdada do painel do cliente — ela era contra alvo **morto**, e o nome agora
  leva a algum lugar. ⚠️ No painel do cliente a regra continua valendo; as duas
  barras divergem de propósito.
  - ⚠️ **A barra estava quebrada no celular, e ninguém tinha visto:** a 390px o
    logotipo pintava **83px por cima de "Aprovados"** em produção. A gaveta
    devolveu 50px e a marca cedeu altura (27px abaixo de 420, 22px abaixo de
    386): fecha de **360px para cima**. 320px segue fora, e é limite conhecido.
  - ⏳ A tela de **Aprovados** (`operador-orcamentos.html`) carrega a mesma
    folha e ficou com a barra antiga (nome em texto + Sair) — divergência
    registrada em [active-work.md](active-work.md).
- **Acabamento em 27/08** (passe `polish` da skill): item de 318px → 258px,
  medida de linha em 68ch, ações em coluna própria, piso de contraste 5,2:1 e
  o pulso da barra com três estados. O brief da superfície fica em
  `.impeccable/surfaces/public-operador-html.md`.
- **Conformidade com as irmãs em 27/08, em dois passes.** O primeiro (lendo
  código) trouxe tokens, marca, foco, rolagem e diálogo. O segundo, com as três
  telas **abertas lado a lado no navegador**, achou o que a leitura não pega:
  a tela desmontava **entre 660 e ~1090px** (trilho rígido de 300px + item de
  largura fixa deixavam só o texto ceder — 10ch a 900px), a barra não tinha o
  `is-rolada` com `blur` das irmãs, três peças estavam de canto reto, os quinze
  ícones tinham ponta arredondada num sistema de traço esquadrado, e a
  engrenagem aparecia como dente solto nas frestas entre os cartões. Agora são
  **três faixas de layout** (>1080 · 1080–760 · <760), com os números da
  landing.
- **Passe de densidade em 27/08**, a pedido do Pedro (*"muito espaço livre com
  um monte de coisa escrito pequeninho"*). A **coluna d'água passou a deitar em
  toda largura** — em pé ela mandava na altura do item e deixava a régua de SLA
  87% vazia — e a **etiqueta mono virou um tamanho só (10,5px)**, no lugar dos
  cinco degraus abaixo de 11px que conviviam na tela. Item de **258 para 126px**;
  três na primeira tela em vez de dois.
- **Passe de composição em 28/08.** Os três passes de 27/08 verificaram cada
  peça contra si mesma e contra as irmãs; nenhum verificou a tela **como
  composição, na largura em que ela é usada**. Os dois defeitos que sobraram
  não estavam em peça nenhuma: (1) o trilho colava na borda da janela enquanto
  a fila centrava na coluna, e a 1920px sobravam **285px de campo morto entre
  as duas** — o par passou a centrar junto, e o fio do trilho subiu para
  `--fio` porque virou a junta; (2) a medida de linha era **não-monotônica** —
  33ch a 900px, **16ch a 1090px**, 50ch a partir de 1340 —, ou seja, alargar a
  janela piorava a leitura. A prova agora **deita entre 761 e 1339px**, e
  nenhuma largura de 430 a 1920 fica abaixo de 49ch. No mesmo passe: a leitura
  do placar centrou na célula (as três ficavam 50–65% vazias) e a ficha parou
  de imprimir a chave do banco no campo Categoria (`nivel_baixo` → "Nível
  baixo") — o `<select>` do mesmo arquivo já escrevia o rótulo humano.
- **Passe de acabamento em 28/08**, a pedido do Pedro (*"o cabeçalho está longe
  da qualidade da landing"*), **sem tirar uma palavra da tela**. A diferença
  medida era de gramática: a landing usa razão **3:1** entre etiqueta (10,24px)
  e leitura (24–31px), e aqui 80% dos 106 blocos de texto viviam entre 10,5 e
  12,5px, com o maior tipo da tela em 28px. O que passou a valer: **chapa de
  duas camadas com gradiente** (a construção do `.instr` da landing) na placa
  do turno, no trilho e no item; o trilho deixou de ser quatro cards e virou
  **uma chapa dividida por corte gravado**; a leitura do placar foi a 2,5rem e
  o relógio da barra a mono branco de 1,05rem; e a rampa do item abriu para
  16/13/12,5/10,5. ⚠️ Dois defeitos antigos apareceram no caminho: o item era
  a última peça com `border` + `clip-path` (fio recortado nos chanfros, proibido
  desde 27/08) e **o número da régua vazava 23px da coluna** — resolvido pelo
  eixo variável do Martian Mono, que as cinco folhas carregam e nenhuma usava.
  Altura dos itens inalterada.
- **O mapa é peça fixa da tela desde 28/08**, não só do diálogo de despacho:
  ocupa o topo do trilho (que foi de 300 para 400px) com os chamados coloridos
  pelo relógio e os técnicos com GPS, e abre em tela cheia como **modo da
  peça** (o padrão do admin), nunca como segunda tela. O motivo é ordem da
  pergunta: no diálogo o mapa abria *depois* da escolha do chamado, um por vez,
  enquanto a decisão geográfica é da fila inteira. Backend intocado — a rota
  já devolvia as coordenadas.
- **Os pinos têm duas escalas desde 31/08**, e quem escolhe é a largura do
  **mapa** (medida no Leaflet), não a da janela: até 800px valem os 22 · 28 ·
  26px desenhados para a coluna do trilho; acima disso — tela cheia, ou a faixa
  abaixo de 1180 onde o trilho vira faixa horizontal — vão para 30 · 40 · 36.
  ⚠️ Regra de janela seria errada aqui: `--trilho-w` é fixo em 400px, então num
  monitor grande a coluna não muda de tamanho e o pino maior só empilharia os 86
  prédios. Detalhes em
  [painel-operador.md](../docs/modulos/painel-operador.md).
- ⚠️ **Estado do dado em produção (medido em 28/08):** 86/86 condomínios com
  coordenada, mas `chamados` **vazia** e `tecnico_localizacoes` com **3 linhas
  no total** (última de 17/08, dos 3 técnicos de 9 que têm login). **É estágio,
  não defeito** — o produto ainda não está em uso, confirmado pelo Pedro. O
  mapa foi desenhado contra a prévia, que é o cenário "em uso".
- **A regra da moldura (28/08, corrigindo o mesmo dia):** *moldura marca o que
  é único; o que se repete é superfície.* A construção do `.instr` da landing
  (anel de 1,5px + gradiente) tinha sido aplicada em tudo, e a primeira dobra
  ficou com **nove peças com anel** — quando tudo é peça usinada, o anel vira
  textura. Hoje só a placa do turno e o mapa têm moldura; item e listas do
  trilho são cor chapada. E a **Regra do Selo passou a valer para o botão**:
  só o item cujo relógio pede alguém agora tem "Despachar" em campo cheio.
- **Corte de simplificação, a pedido do Pedro** (*a tela será usada por pessoas
  mais velhas, com pouca familiaridade com computador*). O primeiro passe
  respondeu com **escala** e ele devolveu *"não mudou praticamente nada"* —
  **aumentar não é simplificar**; a pergunta é *o que sai da tela*. Feito até
  agora: o **item da fila** (28/08) de 3 colunas para 2, de 2 botões iguais
  para 1 botão + 1 link, de 15 peças na face para 10; o **trilho** (31/08) de
  4 peças por linha para 2 (nome · estado), sem o selo de iniciais e sem a nota
  "no mapa"; e o **placar de três números** (31/08), que **saiu da tela** —
  dois dos três eram repetição literal dos cabeçalhos de seção 40px abaixo, e
  "fora do prazo", o único que não era, desceu para esses cabeçalhos, onde
  passou a contar por seção em vez de um total único. O primeiro item subiu de
  y=225 para y=120. **Falta a ficha, o diálogo de despacho e "Já tem
  técnico"** — a fila e as pendências de copy estão em
  [active-work.md](active-work.md).
- ⚠️ **A engrenagem de fundo mudou de casa** (31/08), por dependência do
  placar — e a lição é a que vale reter: *quando a peça de fundo perde o lugar,
  a pergunta não é se ela sai, é onde o campo aberto foi parar.* A máscara em
  px do `.eng` a continha numa faixa **horizontal** (barra + placar + cabeçalho
  da fila) que caiu de 157px para 49, com a barra opaca por cima. Mas o campo
  aberto não sumiu — mas a resposta também não era a margem da janela, que foi
  a segunda tentativa e só existia acima de 1800px. **Hoje ela abraça o mapa**,
  a pedido do Pedro: `.eng` virou o RECORTE (a coluna do trilho, com
  `overflow:hidden`) e `.eng-roda` a peça, centrada no mapa. O que os dois
  arranjos anteriores tinham em comum era ancorar a peça na **janela**;
  ancorada no **conteúdo**, ela não encosta na coluna da fila em largura
  nenhuma — o dente na fresta entre cartões deixou de ser possível **por
  construção, não por calibragem** — e quem a corta por dentro é o mapa, que é
  opaco. **Não há máscara em px em lugar nenhum.**
  ⚠️ **Pré-requisito: `.trilho` perdeu o `background`**, que era `--mar-900`,
  a mesma cor do `body` — pintava por cima da peça sem mudar um pixel. Quem
  devolver aquele fundo faz a engrenagem sumir sem nenhum outro sintoma.
  ⚠️ **Some abaixo de 1180**, a quebra exata em que o trilho vira faixa.
- **A superfície tem DUAS telas desde 31/08** — a fila do turno e **Aprovados**
  (`/operador/painel/orcamentos`), que carrega a **mesma folha**. Nela, clicar
  no orçamento abre o chamado que o executa, já vinculado por
  `chamados.orcamento_id` (migration 079), com título e descrição
  pré-preenchidos a partir do próprio orçamento. O prédio vem do orçamento e
  nunca do corpo da requisição, a prioridade padrão é **P4** (serviço aprovado
  é trabalho agendado) e não há bump de recorrência. **Nenhum valor entra
  nessa tela** — o endpoint não devolve dinheiro.
  ⏳ **As migrations 079 e 080 só rodaram no banco de teste; faltam produção.**
  A tela tem **quatro estados** por orçamento (livre · chamado aberto · chamado
  fechado · marcado à mão), e o que é marcado como feito **sai da lista** — com
  duas voltas: a faixa com "Desfazer" na hora, e a linha "N já feitos ·
  mostrar" no fim, permanente.
  ⚠️ **Aprovados está em REGISTRO DE LEITURA desde 31/08** — placa clara por
  orçamento, manchete com a palavra "aprovados" em âmbar, selo e botão âmbar.
  É a única tela desta superfície fora do registro de operação, e a fronteira
  d'A Regra da Superfície foi reescrita em `DESIGN.md` para dizer o que ela
  sempre quis dizer: o proibido é placa clara **disputando a tela** com
  conteúdo marinho ao lado, não placa clara permanente. A fila do turno
  continua marinho porque é tabela.
- **A evidência do item parou de desenhar ausência (31/08).** Reservatório mudo
  não desenha tubo: todos os mudos cabem numa linha, com os nomes preservados.
  Item de 4 caixas sem sensor: **222 → 189px** (a evidência, de 82 para 49). A trilha virou
  `minmax(320px,1fr)` (tubo de 156 → ~250px; saíram ~490px de campo morto), e o
  número do chamado e "Ver detalhes" encostaram na borda direita — a largura do
  item virou estrutura em vez de sobra.
- ⚠️ **Nunca rodou sob a role real** — não existe usuário `operador` em produção.
  Para olhar a tela sem sessão existe **`/dev/_operador-preview.html`** (rota
  `/dev/:arquivo` em `src/app.js`, **não registrada em produção**), com fixture
  cobrindo os quatro estados de técnico. Ela repete o `?v=N` do `operador.html`
  — bumpou um, bumpe o outro.
- ⚠️ **Todo `--ch` local é morto, nas cinco folhas** (medido em 27/08): o
  `var()` de uma custom property resolve onde ela é declarada, então `--corte`
  pega o `--ch` do `:root` e os filhos herdam o polígono pronto. Cada tela tem
  **um** chanfro, e a rampa do `DESIGN.md` não existe em superfície nenhuma.
  Consertar é nas cinco de uma vez; aqui só se alinhou o global (8 → 10px).

**Painel do cliente** — `public/cliente.html` + `cliente.css` + `cliente.js`

É a **v3**, implementada em 2026-08-14 a partir da comp
[`../docs/comps/painel-cliente-v3.html`](../docs/comps/painel-cliente-v3.html).
A v1 (13/08) foi rejeitada por manter a casca do admin — ver
[decisions.md](decisions.md). Fluxo e pegadinhas em
[painel-cliente.md](../docs/modulos/painel-cliente.md).

- **Folha autônoma no sistema "Chapa"**: `cliente.html` **não carrega
  `admin.css`**, em volume mais baixo que a landing. Era o defeito central — o
  painel do síndico não era inspirado no admin, era o admin.
- **O cabeçalho é o mesmo da landing**, desde 14/08 literalmente: tokens com os
  mesmos nomes e valores (`--barra-h`, `--area-max`, `--gut`, `--saida`),
  mesma quebra de 760px, `sticky` também no celular. O nome do prédio **não
  fica na barra** — é o `.placa-topo`, cabeçalho do instrumento. Mudou a barra?
  Mude em `landing.css` e `login.css` também.
- **Não há seções nem navegação.** Sumiram sidebar, colapso, topbar, KPIs,
  abas, buscas e tabelas. A página é: **a resposta** (uma frase + os
  reservatórios como prova + uma ação) ocupando a primeira tela, **a história**
  agrupada por dia abaixo, e um rodapé. Todo o resto abre como **ficha**
  (placa clara sobre o marinho): pedir ajuda, chamado, todos os reservatórios,
  reservatório e sua conta. **Nenhuma funcionalidade saiu.**
- **O veredito tem cinco ramos** (semtel → crítico → mudo → baixo → normal), e
  o ramo normal foi partido em dois: com chamado aberto aparece a **linha de
  atendimento**, com ponto azul e o título do chamado.
- **A prova são no máximo três colunas**, tenha o prédio 3 ou 30 reservatórios.
  O resto vira frase com a faixa real, que abre a lista completa.
- **Cilindro no desktop, coluna no celular.** Sem limiar desenhado dentro do
  tanque — ele vive no gráfico da ficha do reservatório. As faixas de 45%/20%
  são as do backend: mudou lá, muda na landing e aqui.
- **Sem ApexCharts**: o gráfico da ficha é SVG no próprio `cliente.js`.
- ⚠️ A **ponte de tokens** do admin (`--muted`/`--text`/`--accent`) **não
  existe mais** — o JS foi reescrito e não usa token do admin.
- ⚠️ **Alerta resolvido não aparece na história** — `/cliente/status` só
  devolve os abertos. É buraco conhecido, não bug.
- ⚠️ **`ja_avaliado` só vem do detalhe do chamado**: o painel busca os 3
  fechados mais recentes uma vez e guarda. Uma linha no SELECT da lista
  elimina isso (roadmap).
- ⚠️ **Nada foi verificado contra o backend real**; a validação foi em harness
  estático, contact sheet de 8 estados × 2 tamanhos (1920px e 390px).

**Orçamentos do cliente** — `public/cliente-orcamentos.{html,js}`, rota de
página `/cliente/painel/orcamentos?orc=N` 🟡 **no ar, nunca visto logado**

Segunda página do painel do cliente (21/08/2026), onde o síndico aprova, recusa
ou comenta um orçamento — antes a resposta voltava por telefone/WhatsApp e quem
registrava era o escritório.

- **É PÁGINA, NÃO MODAL.** Lista e documento são dois estados da mesma página,
  trocados por `history.pushState`. A v1, em fichas abertas por um card do
  painel, foi recusada: orçamento é documento que a pessoa lê, pensa e mostra
  para outra antes de responder — pede URL própria, rolagem inteira e o voltar
  do celular. Ver [decisions.md](decisions.md).
- **Material: papel.** Chapas claras sobre o campo marinho, ao contrário do
  painel, que é instrumento. Barra e rodapé seguem marinho, senão a pessoa acha
  que saiu do sistema. Usa a mesma `cliente.css` — é o mesmo produto, não um
  lugar novo.
- ⚠️ **A página não pode morar em `/cliente/orcamentos`**: as rotas de página
  são registradas antes do `app.use("/cliente", ...)` e ela sombrearia o `GET`
  da API de mesmo nome. Página é nome de tela, API é nome de recurso.
- ✅ **O cliente entra SEM SENHA** desde 25/08/2026 — e-mail + código de 6
  dígitos (`POST /auth/codigo` → `POST /auth/verify-otp`). O escritório cria o
  usuário com o e-mail, e o e-mail vira a credencial. Equipe interna segue com
  senha. Ver [../docs/modulos/autenticacao.md](../docs/modulos/autenticacao.md).
- ✅ **O login da tela de orçamentos é um cartão na própria página** desde
  25/08/2026 — não redireciona mais para `/login`. A URL com `?orc=N` fica na
  barra e o 401 no meio do caminho reabre o cartão. `GET /cliente/orcamentos`
  aberta no navegador redireciona 302 para a página, para não devolver
  `{"error":"Token ausente"}` em JSON cru.
- ✅ **O corte por inatividade respeita o cartão** desde 28/08/2026, e o
  conserto de 26/08 (adiar um tique de timer) **nunca funcionou**: os `defer`
  executam em ordem, mas o navegador ainda baixa o próximo, e nessa espera o
  timer roda — ganhava em 100% das cargas medidas. Esperar o `DOMContentLoaded`
  consertava esta tela e quebrava o painel (o `cliente.js` tomava 401 antes e
  mandava para `/login?motivo=expirado`). Hoje o corte é **síncrono** e a página
  declara a intenção por atributo — `data-corte="cartao"` no `<body>` —, que
  está no DOM antes de qualquer `defer` e não esbarra na CSP (`script-src
  'self'` mata `<script>` inline **em silêncio**). Ver
  [../docs/modulos/autenticacao.md](../docs/modulos/autenticacao.md).
- ✅ **Sessão nova não morre com carimbo de sessão velha** desde 28/08/2026.
  `tg_ultima_atividade` só é apagado pelo próprio corte, e nenhum caminho de
  login carimba: quem saía num dia e entrava no outro tinha a sessão nova morta
  na primeira tela — no painel virava salto para `/login`, aqui virava o cartão
  pedindo o e-mail logo depois de entrar (foi o sintoma relatado). O `expirou()`
  ignora carimbo anterior ao `iat` do JWT. **O conserto fica no
  `inatividade.js`, não espalhado** pelos 13 pontos que gravam ou apagam sessão
  — o `_concluirEntrada`, escrito depois, já tinha esquecido de carimbar.
- ✅ **Quem já tem sessão não vê a tela de login** desde 01/09/2026. O sintoma
  relatado era "o PWA desloga quando fecho a página", e **não era isso**: o token
  seguia vivo no `localStorage`. O `start_url` do manifest é lido uma vez, na
  instalação, e valia `/login` para todo mundo até 31/08 — o ícone antigo abre
  ali, e o `login.js` só redirecionava **depois** de um POST. Agora ele confere
  token + `exp` + `role` no carregamento e salta com `location.replace`. **As
  guardas (`?motivo=` na URL e `exp` no futuro) existem contra loop**
  login↔painel, não por precaução. O carimbo de inatividade **não** é reconferido
  ali de propósito — seria uma segunda cópia dos 30 minutos. Ver
  [../docs/modulos/autenticacao.md](../docs/modulos/autenticacao.md).
- ✅ **A resposta do cliente é uma PENDÊNCIA COM BAIXA** desde 26/08/2026
  (migration 078). Abrir a ficha marca `resposta_vista_em` (quem abriu), mas
  quem apaga o aviso é a baixa explícita — `resposta_tratada_em`, botão na
  própria ficha, com "Reabrir". A pendência aparece em três lugares: faixa no
  topo, selo na linha do orçamento e ponto no card do condomínio. **Antes era
  só a faixa, e o primeiro clique a matava** — ver
  [decisions.md](decisions.md).
- ⚠️ **Nada aqui pode ser `<a href>` para rota autenticada.** O `authRequired`
  lê só o header `Bearer`; não há cookie de sessão. Foi assim que o botão do
  PDF nasceu quebrado (consertado em 24/08 — ver
  [../docs/changelog.md](../docs/changelog.md)).
- ✅ **O convite no e-mail está LIGADO** desde 25/08/2026 —
  `ORCAMENTO_LINK_PAINEL` virou kill-switch (`=0` desliga). Com link, o e-mail
  **não leva o PDF anexado**: o documento está aqui, e o anexo competindo com o
  botão fazia o síndico ler e nunca responder. Sem login no painel, o e-mail
  sai com o PDF como antes.
- ✅ **Migration 074 aplicada em produção** em 24/08/2026.
**Tela de login** — `public/login.html` + `login.css` + `login.js`
- Desde 2026-08-13 segue o sistema **"Chapa"** da landing (split screen,
  marinho + `#fbb329`, chanfro de 45°), **não** o âmbar do painel: `/login` é a
  costura entre o site e o painel e não pode parecer outra empresa.
- ⚠️ `login.css` **duplica** os tokens da landing de propósito (as páginas não
  compartilham CSS). Mudou a paleta? Mude nos dois.
- **Identifier-first desde 25/08/2026:** a tela pede o e-mail, pergunta ao
  `POST /auth/metodo` qual é o campo seguinte e mostra só ele — senha para a
  equipe interna, código para o cliente. Saiu o botão "Sou do condomínio —
  entrar sem senha": ele obrigava a pessoa a se classificar dentro da nossa
  modelagem de dados. E-mail confirmado vira etiqueta gravada (`.identidade`)
  com um "trocar" ao lado. **Separar os painéis em domínios diferentes foi
  avaliado e descartado** — ver [decisions.md](decisions.md).
- ⚠️ Os três passos (email/senha/OTP) alternam por atributo `hidden`, nunca por
  `style.display`, e `required` acompanha a visibilidade do campo. Detalhes em
  [autenticacao.md](../docs/modulos/autenticacao.md).
- ⚠️ A foto do painel (`public/fotos/reservatorios.jpg`) tem a marca do
  **fabricante do tanque com telefones legíveis** no canto superior esquerdo —
  o enquadramento corta esse canto de propósito.

**Segurança & operação**
- Envs obrigatórias em produção (JWT_SECRET, CORS_ORIGINS) com `process.exit(1)`.
- RBAC com **5 roles ativas**: **admin** (master — tudo), **gerente** (operação
  do negócio, sem as partes irreversíveis), **operador** (Monitor + Chamados +
  config "conta"), **tecnico**, **cliente**. `admin_viewer` continua no CHECK do
  banco mas está **morto** — sumiu de `src/`, quem tiver essa role toma 403 no
  painel inteiro.
- **Três níveis no painel** (jul/2026): `adminOnly` (admin+gerente+operador) ·
  `gestaoOnly` (admin+gerente) · `masterAdminOnly` (só admin). Divisão em
  [autenticacao.md](../docs/modulos/autenticacao.md).
- **A restrição do operador é real desde 27/08/2026** — 49 rotas trocaram
  `adminOnly` por `gestaoOnly` (orçamentos, O.S., relatórios, contratos,
  conversas do WhatsApp, `GET /admin/usuarios`, geocoders) e o `operador` saiu
  de `equipeInterna` (equipamentos). **Contratos e Dashboard saíram do menu dele
  junto** — o perfil ficou em quatro telas: Alertas · Chamados · Telemetria ·
  Mapa, mais a aba "Conta". Sobram 24 rotas, contra 118 bloqueadas. Detalhe em
  [autenticacao.md](../docs/modulos/autenticacao.md).
- **O operador tem painel próprio desde 27/08/2026** — `/operador/painel`, a
  *fila do turno*: um endpoint (`GET /operador/fila`) monta a tela inteira com
  o SLA já calculado no servidor, e a ordem é o prazo que estoura primeiro.
  Arquivos próprios (`public/operador.html/.js/.css`), sem importar `admin.js`.
  Com ele o perfil passa a alcançar **25 rotas**. Fluxo em
  [painel-operador.md](../docs/modulos/painel-operador.md).
- **O pino de técnico do mapa do operador é o do admin desde 01/09/2026** —
  gradiente, anel branco, glow e pulse do `.tec-pin`, mais o estado **"sem
  sinal"** (GPS parado há 10 min) que a tela não tinha. ⚠️ A paleta das duas
  telas **já era idêntica**: o que divergia era a presença do técnico, que
  usava `--fio-forte` e ficava menos visível que os 87 prédios de fundo.
  Detalhe em [painel-operador.md](../docs/modulos/painel-operador.md).
- **O mapa do operador reenquadra até o operador mexer (01/09/2026)** — era
  "uma vez por carregamento", e numa tela aberta o turno inteiro isso deixava a
  vista decidida pelo estado das 8h. ⚠️ Sintoma real: técnico entrou em campo
  às 12h53 a 7,84 km do centro da carteira, numa coluna que alcança ±7,01 km —
  o pino era desenhado a cada ciclo mas ficava 830 m fora da borda, e só F5 ou
  a tela cheia o traziam de volta. Agora trava no **gesto** (`_operadorMexeu`),
  não no primeiro ciclo.
- **Chamado novo foca o mapa e abre balão (01/09/2026)** — `flyTo` até o prédio
  mais um popup com prioridade, relógio, descrição e o botão de despacho. O
  gatilho é o `_novos` que já destacava o item na fila; é a **única** coisa que
  passa por cima do `_operadorMexeu`, interrompe uma vez e foca só no mais
  urgente quando entram vários. ⚠️ `L.popup` solto, nunca `bindPopup` — ele
  brigaria com o clique de despacho do pino.
- **Configurações dinâmicas** editáveis pelo admin (whitelist `CHAVES` em
  `config.service.js`) — intervalos de job, modelo IA, timeouts, sem deploy.
- Email de alerta crítico (Resend).
- Cache em 3 camadas documentado (ver [`../CLAUDE.md`](../CLAUDE.md)).
- **Área segura do iOS tratada nas cinco superfícies instaláveis** (18/08/2026; painel do operador em 27/08): admin, painel do cliente, login, painel do operador e app do técnico. A pegadinha
  é que `env(safe-area-inset-*)` só devolve valor com `viewport-fit=cover` no
  `<meta viewport>`. Mecanismo em [`../docs/arquitetura.md`](../docs/arquitetura.md). ⚠️ Não verificado em
  iPhone — não há aparelho iOS no ambiente.

## Banco de dados

- `database/schema.sql` tem o schema base (condominios, reservatorios, leituras,
  alertas, usuarios, login_codes, trusted_devices).
- **Toda a evolução está em `migrations/001..073`** (WhatsApp, mapa, chamados,
  técnicos, O.S., orçamentos, SLA P1-P4, planos, contratos, state machine, etc.).
- **FK de autoria → `usuarios` sempre com `ON DELETE` explícito** (073, 19/08/2026):
  sem cláusula o Postgres assume `NO ACTION` e a remoção do usuário quebra com
  `23503`. Regra e tabela de padrões em
  [`../docs/banco-de-dados.md`](../docs/banco-de-dados.md), seção "Remoção de usuário".
- Aplicar com `node scripts/migrate.js NNN_nome.sql` (lê `DATABASE_URL`).
  `migrations/migrate.js` em `scripts/`.
- Scripts utilitários: `limpar-dados-teste.sql`, `restaurar-defaults.sql`.
- **Banco de teste:** `scripts/seed-teste.js` monta o mínimo (admin, técnicos,
  condomínios, planos) e `scripts/seed-cenario-telemetria.js` dá variedade à
  telemetria do condomínio DEMO — sem ele os 4 reservatórios ficam todos
  offline com o mesmo `last_seen`. Os dois recusam rodar em produção
  (`src/db-url.js`). Ver
  [`../docs/modulos/painel-cliente.md`](../docs/modulos/painel-cliente.md).

> ⚠️ Há **duas** pastas de migrations: `migrations/` (numeradas 001-044, atuais)
> e `database/migrations/` (datadas, do schema original de 2026-03/04). As ativas
> são as numeradas.
