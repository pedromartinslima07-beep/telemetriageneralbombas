---
tags:
  - projeto
  - contexto/decisoes
aliases:
  - Decisões Arquiteturais
---
# Decisões Arquiteturais

Decisões deliberadas tomadas ao longo do projeto. Cada uma custou tempo ou foi
tomada conscientemente — não reverter sem motivo. Este arquivo é a fonte
canônica do "porquê"; o "o quê" está em `../docs/` e em [`current-state.md`](current-state.md).

## Stack e frontend

- **HTML/CSS/JS puro, sem framework/build.** Backend Express serve o frontend
  como estático. Decisão explícita: **não migrar para Next/React/Vite**, nem em
  redesigns. ApexCharts/Chart.js/Leaflet/Lucide vêm como arquivos locais em
  `public/static/`.
- **App mobile = Capacitor sobre HTML/CSS/JS puro** (`app/public/`). Em dev o
  Express serve `/app/*`; em prod o Capacitor empacota e faz fetch direto ao
  backend (capacitor://). Reusa tokens e componentes de `public/admin.css`.
- **Visual "Mission Control" único.** Brand amber (`--accent: #f0b014`). Toda
  tela herda a paleta dark do admin — **nunca criar paleta paralela**. Redesigns
  adaptam a referência visual ao Mission Control já implementado (preservar
  cores, performance de animação, logos, padrões de polling).
- **Animações compositor-friendly.** Transições da sidebar usam `will-change` +
  `contain: layout paint`, opacity/max-width em vez de display none/block, tudo
  unificado em 280ms `cubic-bezier(.4,0,.2,1)` (material standard easing) para
  evitar reflow cascateado e "estalos".
- **Camada HUD "Painel de comando" (só app mobile).** Para deixar o app "mais
  tecnológico" sem fugir do Mission Control, o `app/public/app.css` ganhou um
  bloco **aditivo** no fim (+ tokens `--hud-*` no `:root`): grid técnico +
  scanline de fundo (estáticos, custo de pintura ~zero), números/IDs em
  monospace, headers uppercase tracked, hairline âmbar e indicador de aba no
  bottom-nav. Mantido isolado e reversível de propósito (remover o bloco
  desfaz tudo). **Corner-brackets âmbar nos cards foram descartados** após review
  visual — poluíam (pareciam "cantos de quadradinho amarelo" repetidos em cada
  card, inclusive os menores/injetados). **Lição:** efeitos aplicados por classe
  compartilhada (`.card`, `.tec-card`) propagam pra muito mais lugar do que se
  imagina — preferir acento pontual a decorar todo container.
- **Não redefinir `position` em elementos `sticky` ao adicionar pseudos de HUD.**
  `.cli-nav`, `.app-header*` já são `position: sticky`; sobrescrever para
  `relative` (mesma especificidade, regra nova vinha depois) quebra o sticky e o
  menu/header "descem" com o scroll. Pseudo-elementos absolutos já se ancoram no
  `sticky` — não precisam de `relative`.

## Cache (a pegadinha nº 1 do projeto)

- **3 camadas de cache** que precisam ser sincronizadas ao mexer no admin:
  (1) browser HTTP cache via `?v=N` nos assets; (2) **Service Worker**
  network-first list + `CACHE_NAME`; (3) HTML cache via `Cache-Control:
  no-cache` (middleware `_htmlNoCache`). Detalhes operacionais em `../CLAUDE.md`.
- **JS/CSS servidos com `no-cache`** (revalida via ETag, 304 quando não mudou) —
  elimina a classe inteira de bug de asset stale.
- **`/admin/reset-cache`** propositalmente dentro de `/admin/*` (que o SW antigo
  trata como network-first) para nunca ser servido do cache quebrado.

## Telemetria e dados

- **Write threshold no pipeline de ingestão:** só grava leitura se Δnível ≥
  `TELEMETRIA_PCT_THRESHOLD` ou passou `TELEMETRIA_HEARTBEAT_MIN`. ESP32 envia a
  cada 10s, banco grava só o que importa.
- **Calibração e limiar da bomba ficam no banco, não no firmware.** Firmware só
  envia `adc_raw` + `bomba_rms`; conversão e decisão acontecem no backend
  (ajustável pelo painel sem regravar o ESP32).
- **CTE única** combina insert da leitura + update de last_seen + auto-resolve de
  alerta offline em um round-trip.
- **Sem tabelas agregadas** (Fases 9A/9B/9D descartadas). Agregação por bucket
  é feita on-the-fly nas queries de histórico; o write-threshold já controla
  volume. Retenção por job de limpeza (Fase 9C).
- **`timestamptz` em tudo** (timezone-aware).

## Jobs em background

- **`setTimeout` recursivo, não `setInterval`.** Cada job lê config dinâmica via
  `config.service.js` a cada tick — permite ajustar intervalo no admin sem
  deploy. Auto-iniciados pelo `app.js`, sem processo separado.
- Toda config dinâmica precisa estar na whitelist `CHAVES` de
  `config.service.js` (com tipo + min/max) para ser editável via
  `PATCH /admin/configuracoes`.

## WhatsApp + IA

- **Gateway: Meta WhatsApp Business API** — escolhido após abandonar Evolution
  API (complexa de hospedar no Railway) e Z-API (risco de ban). Número
  verificado, zero risco de ban, custo por conversa.
- **Webhook nunca bloqueia:** responde 200 imediato, processa em background
  (`setImmediate`). A Meta reenvia se demorar.
- **Idempotência por `message_id`** (constraint UNIQUE + `ON CONFLICT DO NOTHING`).
- **A IA interpreta/consulta/sugere; o backend executa.** Ações não-P1
  (`abrir_chamado`, `criar_solicitacao_orcamento`) ficam em `pendente_acao` e
  só executam após confirmação explícita do cliente. P1 (emergência) executa
  direto.
- **Contexto operacional pré-injetado** (telemetria/alertas/chamados) antes de
  cada chamada à OpenAI — a IA entra sabendo o estado real, gastando menos
  function calls.
- **State machine formal** (triagem → aguardando_confirmação → chamado_aberto /
  escalado / finalizado) + **anti-loop** (3 trocas sem avanço escala para
  humano).
- **Assumir conversa cala a IA:** com `assumida_por_id` setado, a IA não
  responde (mas as mensagens continuam sendo salvas).
- **gpt-4o-mini** por custo (~20x menor que GPT-4o), suficiente para
  classificação/atendimento. Mensagens triviais filtradas antes da API.
- **System prompt editável** via Configurações → IA (config dinâmica) — base
  para a estratégia de especialização (Fase 10).
- **Sessão WhatsApp com timeout** (8h configurável): job fecha conversa inativa
  e pede avaliação 1–4 pelo próprio WhatsApp, alimentando a curadoria.

## Mapas

- **Leaflet local** (sem CDN externo, ~150kb) + **tiles dark Carto via proxy
  próprio** (`/tiles/:z/:x/:y.png`) — resolve bloqueio por adblock/firewall
  corporativo (tudo vem do mesmo origin). Proxy tem cache em memória (4000 tiles,
  24h TTL) + dedupe de requisições inflight + rotação de subdomínios.
- **OSM fallback removido** (Carto é estável; OSM proíbe proxy em apps).
- **Geocoding híbrido:** ViaCEP (texto) + BrasilAPI + AwesomeAPI (coords) +
  Nominatim (fallback, fila de 1 req/s respeitando ToS). Reverse geocode ao
  arrastar o pino sobrescreve os campos.
- **Sem markercluster por enquanto** — adicionar quando o nº de condomínios
  justificar.
- **Classificação por zona de SP** usa mapa de ~80 bairros conhecidos (a divisão
  oficial não é simétrica; quadrante lat/lng puro falhava — ex: Capão Redondo).

## App mobile

- **Push via FCM, não notificação local** (Fase 7G, decidido em 2026-07-28).
  A alternativa barata seria `@capacitor/local-notifications` disparado pelo
  polling de 30s que já existe. Descartada: o Android congela os timers de
  JavaScript da WebView quando o app vai pro segundo plano, então ela funciona
  com o app aberto ou recém-minimizado e **falha exatamente no caso que motivou
  o pedido** — celular no bolso, tela apagada. Entregar "às vezes notifica" é
  pior que não notificar, porque o técnico passa a confiar e perde chamado.
- **7G não depende da 7J.** O roadmap marcava push como bloqueado pela
  publicação nas lojas; é falso — FCM funciona em APK instalado na mão. A
  dependência errada manteve a fase parada sem motivo.
- **Terceira via considerada e descartada:** fazer o `NativeGpsService` (o
  ForegroundService próprio, que já fica vivo das 8h às 18h) pesquisar chamados
  e postar notificação nativa, dispensando o Firebase. Descartada por só
  funcionar dentro da janela de expediente e com GPS ligado, custar bateria e
  significar mais código nativo próprio pra manter — enquanto o FCM é
  infraestrutura pronta e gratuita nesse volume.
- **`targetSdk` não é preferência, é prazo** — ver
  [`roadmap.md`](roadmap.md) (7J). A Play Store sobe o piso todo ano; ficar pra
  trás não degrada nada no app instalado, mas impede publicar atualização.
- **Lição (jul/2026): `startForeground()` não salva um bound service.** O
  `NativeGpsService` nasceu criado só por `bindService(BIND_AUTO_CREATE)`, e por
  isso morria com a tela apagada por mais correto que estivesse o resto
  (manifest com `foregroundServiceType`, todas as permissões, plugin registrado).
  Serviço que precisa sobreviver à Activity **tem que ser *started***
  (`startForegroundService()` + `onStartCommand` + `START_STICKY`); binding é só
  um canal de conversa, não um ciclo de vida. Corolário: com `START_STICKY` o
  sistema recria o serviço com **Intent nulo** — toda config precisa estar
  persistida, senão ele volta vivo e inútil.
- **Sintoma diagnóstico que economiza horas:** se a notificação persistente do
  ForegroundService **some** da barra, o problema é ciclo de vida do serviço, não
  GPS/permissão/rede. Se ela **fica** e o dado não chega, aí sim é rede ou POST.
- **Lição (31/07/2026): quando a coleta muda de camada, a regra tem que ir
  junto.** A janela de expediente do GPS (8h–18h) nasceu correta em 22/05: o
  `watchPosition` da WebView coletava, postava **e** era desligado pelo timer da
  própria WebView — uma camada só. Em 10/06 a coleta migrou pro
  `NativeGpsService` (Java) pra sobreviver à tela apagada, e **a janela ficou pra
  trás no JS**. O timer continuou existindo e continuou *parecendo* funcionar,
  mas agora só mandava um `stop()` pra um serviço que o Android mantém vivo
  enquanto congela a WebView. Resultado descoberto 7 semanas depois: pin de
  técnico no mapa às 19h.
  - **O que torna esse erro caro:** o commit que quebrou entregava exatamente o
    que prometia, e o teste natural ("o GPS continua funcionando com a tela
    apagada?") passa. O sintoma só aparece à noite, quando ninguém olha o mapa.
  - **Regra prática:** ao mover coleta/envio de camada, listar as regras que
    dependiam da camada antiga e mover cada uma explicitamente. Se a regra é de
    negócio (horário, limite, permissão), o destino certo é o **backend** — a
    única camada que o Android não congela, não mata e não recria sem contexto.
  - **Invariante espalhada em N camadas é dívida.** A janela do GPS mora hoje em
    três (backend, Java, JS) por necessidade; por isso o backend é declarado
    fonte da verdade e o mapa das três está em
    [`../docs/modulos/app-mobile.md`](../docs/modulos/app-mobile.md), num lugar
    só.
- **Config inválida cai no default, nunca em "sem restrição".** `inicio >= fim`
  na janela do GPS resolve pra 8–18, não pra "rastreia sempre": um valor errado
  no banco não pode desligar uma proteção em silêncio. Desligar continua
  possível, mas só pela forma explícita e documentada (`0`–`24`).
- **Fuso da operação é fixo (`America/Sao_Paulo`), não o do servidor nem o do
  aparelho.** O Railway roda em UTC — às 19h de SP um `getHours()` cru dá 22, e
  a janela inteira desliza 3 horas. No aparelho, relógio fora de hora deslocaria
  a janela por técnico.

## Segurança e RBAC

- **Envs obrigatórias em produção** com `process.exit(1)` se ausentes
  (`JWT_SECRET`, `CORS_ORIGINS`).
- **2FA por email obrigatório** no login (desabilitável em dev via `OTP_DISABLED`,
  lido com `.trim()` para tolerar comentário inline no .env).
- **device_key por reservatório** (não há chave global de devices).
- **Hierarquia de roles real:** admin / admin_viewer / tecnico / cliente. O
  `master_admin` foi removido (existia no código mas nunca foi atribuído).
- **`em_atendimento` só via app do técnico com GPS** (`/iniciar-atendimento`);
  `PATCH /chamados/:id` bloqueia esse status — garante que o status reflita
  presença física no campo.
- **Assinatura de contrato não usa ZapSign nem D4Sign** (nem vai usar —
  decisão explícita do dono do projeto: são pagos). O fluxo é próprio
  (migration 056 + reforço em 063): link por e-mail com token único +
  **código de 6 dígitos obrigatório antes de assinar** (2FA equivalente ao do
  login, fecha a brecha de "quem tem o link assina") + **protocolo** (hash
  SHA-256 de contrato+papel+nome+doc+ip+timestamp) impresso no PDF junto com
  IP e data/hora completa — evidência que sobrevive mesmo se o banco for
  alterado depois. Validade jurídica vem da MP 2.200-2/2001 art. 10 §2º
  (assinatura eletrônica simples, não ICP-Brasil). Avaliamos a API de
  assinatura do gov.br como alternativa gratuita: **hoje é só pra órgão
  público** (exige domínio `gov.br`/`jus.br`/etc. e aval de Gestor Público),
  não dá pra empresa privada integrar — só o site `assinador.iti.gov.br`
  aceita qualquer pessoa, mas é manual (sem API), não automatiza no fluxo.
  Um carimbo do tempo de autoridade certificadora (RFC 3161 acreditada
  ICP-Brasil) também é sempre pago — não existe opção gratuita pra isso.

## Operação / banco

- **DELETE explícito em scripts de limpeza, nunca `TRUNCATE ... CASCADE`** — no
  Postgres o CASCADE propaga para TODAS as tabelas com FK ignorando
  `ON DELETE SET NULL`, arrastando logins junto.
- **Migrations idempotentes** (`IF NOT EXISTS` / `IF EXISTS`), aplicadas com
  `node scripts/migrate.js NNN_nome.sql`. Rodar **imediatamente** ao mexer no
  schema, mesmo em dev (lição da Fase 7E: marcar fase como concluída antes de
  rodar a migration causou bug silencioso de tabela inexistente).
- **Puppeteer singleton** para PDFs — browser reutilizado entre requisições
  elimina o cold start de 10-20s no Railway; `waitUntil: domcontentloaded`
  (HTML gerado localmente, sem requests externos).
- **Upload de fotos de O.S. em base64** com `express.json({ limit: "8mb" })`;
  comprimidas client-side (~150-300KB, base64 infla ~33%).

## Decisões de schema (modelagem)

- **Sistema de orçamentos unificado (migration 030).** Coexistiam dois modelos
  paralelos: colunas `orcamento_*` em `ordens_servico` + `orcamento_itens`
  (sistema A) e as tabelas `orcamentos`/`orcamento_linhas` (sistema B). A 030
  unificou tudo em `orcamentos`/`orcamento_linhas` (em transação, com backfill),
  dropou as 12 colunas formais da O.S. e a tabela `orcamento_itens`.
  - **Mantidos na O.S.:** `orcamento_necessario` e `orcamento_observacoes` — são
    input do técnico no campo (a "semente" do orçamento formal).
  - As rotas `/admin/orcamentos/:os_id/*` mantêm `:os_id` na URL por compat com
    o frontend, mas resolvem `orcamento_id` via helper `_garantirOrcamentoDaOs`
    (cria o registro com número sequencial `OR-XXXXXX` se ainda não existir).
- **FK chamados↔O.S. é unidirecional (migration 034).** Existiam duas FKs
  (`chamados.ordem_servico_id` E `ordens_servico.chamado_id`) — toda escrita
  precisava sincronizar as duas pontas (risco de inconsistência). Ficou só
  `ordens_servico.chamado_id` com `UNIQUE` (preserva o 1:1). A idempotência do
  `iniciar-atendimento` passou a vir do `UNIQUE` do banco.
- **`responsavel_id` ≠ `tecnico_id` em `chamados`** (semântica distinta,
  intencional): `responsavel_id`→`usuarios` é o admin que acompanha;
  `tecnico_id`→`tecnicos` é quem executa em campo. Não unificar.
- **`origem` em `orcamentos` (migration 036):** `admin | ia | os`. A IA distingue
  **problema operacional** (vira chamado) de **solicitação comercial** (vira
  orçamento rascunho `origem='ia'`). A IA nunca cota preço — só encaminha.
- **Contrato ativo único:** índice parcial `UNIQUE (condominio_id) WHERE
  ativo=TRUE` em `contratos` — renovação cria um novo e marca o antigo
  `ativo=false`. Habilita cálculo de MRR.
- **`alerta_comentarios` sem FK** para o alerta: a coluna `alerta_id` cobre duas
  origens (`telemetria` | `chamado`), então o vínculo é lógico, não FK. Por isso
  o cleanup de alertas precisa apagar os comentários de telemetria junto (CTE).
- **`equipamentos.condominio_id` é nullable (migration 070).** A etiqueta nasce
  em branco e é colada na bomba **antes** de existir cadastro — a bomba chega na
  oficina primeiro. Exigir dono no INSERT obrigaria a cadastrar antes de
  etiquetar, que é justamente o passo que ninguém faria na prática.
- **`equipamento_movimentacoes.usuario_nome` é snapshot redundante.** Todas as
  FKs da tabela são `ON DELETE SET NULL`; histórico que perde o autor quando o
  usuário é apagado deixa de ser histórico. O nome é gravado junto no INSERT.
- **`equipamentos.status` denormalizado** a partir da última movimentação (mesma
  escolha de `reservatorios.last_seen`): a listagem da bancada é a tela mais
  consultada do módulo e não deveria precisar de `LATERAL` por linha. Em troca,
  status só muda por movimentação — nunca há mudança de estado sem rastro.

## Equipamentos e etiqueta QR (Fase 12A)

- **A etiqueta é do equipamento, não da ocorrência.** A mesma bomba volta várias
  vezes à oficina, e é o histórico das vezes anteriores que se perde hoje —
  etiqueta por passagem jogaria fora exatamente o ativo do módulo. Custo: exige
  o fluxo de etiqueta em branco (acima), porque a identidade precisa existir
  antes do cadastro.
- **Sem plugin de scanner no app.** A câmera nativa do Android já lê QR e abre a
  URL; um plugin (`@capacitor-mlkit/barcode-scanning`) mexeria no build Android,
  que está sob o prazo de 31/08 da Play Store (7J). Também faz a ficha funcionar
  para quem não tem o app instalado — pessoal da oficina, por exemplo. Scanner
  in-app fica como 12D, depois da publicação.
- **Código do QR aleatório, não sequencial.** A ficha revela endereço, contato e
  histórico do condomínio; `/e/1`, `/e/2` exporia o parque inteiro a quem tem um
  navegador. Base32 Crockford (sem I, L, O e U, que se confundem na digitação),
  8 caracteres ≈ 1,1 trilhão de combinações. A ficha exige login por cima disso.
- **Guard novo `equipeInterna` em vez de afrouxar `adminOnly`.** Quem escaneia na
  bancada é o técnico, que não passa em `adminOnly` — mas `cliente` não pode
  entrar de jeito nenhum. Allowlist explícita de 4 roles, não "authRequired sem
  guard". Pelo mesmo motivo nasceu `GET /equipamentos/condominios`: o técnico
  precisa apontar o prédio, mas `GET /condominios` (adminOnly) devolve endereço,
  contato e CNPJ — a rota nova devolve só id e nome.
- **A foto do equipamento fica atrás de autenticação.** A rota equivalente de
  `os_fotos` é pública, com um comentário assumindo a escolha ("compatibilidade
  com `<img src>`, que não manda header"). Aqui o id da foto é sequencial e o
  conteúdo é o interior da casa de máquinas de um cliente, então o front busca
  com `fetch` + object URL. O custo é um punhado de linhas em `equipamento.js`.
- **O gerador de etiquetas recusa host local.** Etiqueta é física e permanente:
  um QR apontando para `localhost` vira lixo colado numa bomba que ninguém vai
  reetiquetar. Falhar antes de o papel sair da impressora é barato; depois, não.
  `PUBLIC_BASE_URL` é a env que resolve; `&forcar=1` só para teste.
- **A ficha herda `admin.css`, não o sistema "Chapa".** É ferramenta de operação
  interna, como o app do técnico — a mesma razão pela qual a landing e o painel
  do cliente **não** herdam do admin. O critério é quem usa e para quê, não a
  plataforma.

## Decisões descartadas (e por quê)

Registradas para não serem "redescobertas" e refeitas. Se o escopo mudar, o
desenho em camadas original continua válido.

- **Tabelas agregadas de leituras — `leituras_agregadas_hora`/`_dia` (Fases 9A,
  9B) ❌.** O produto **não precisa** de histórico > 60 dias (confirmado com o
  usuário). Com a política de retenção (9C) a tabela `leituras` estabiliza em
  ~600 MB; gráficos > 7 dias são servidos com buckets diários
  (`DATE_TRUNC('day', ...)`) direto da raw. Sem tabelas agregadas, sem
  roteamento de query por granularidade (**9D** também descartada).
- **WebSocket no WhatsApp ❌/⏸️.** Polling de 5s na conversa selecionada atende
  o volume atual. Reavaliar só se o volume crescer muito.
- **`leaflet.markercluster` ⏸️.** Adiado até o nº de condomínios justificar
  clusterização dos pinos.
- **Evolution API / Z-API ❌ → Meta Business API.** Evolution era complexa de
  hospedar no Railway; Z-API tinha risco de ban. A Meta (número oficial
  verificado) elimina o risco de ban ao custo de tarifa por conversa.
- **Fallback OSM no proxy de tiles ❌.** Carto é estável e o OSM oficialmente
  proíbe proxy em apps — manter só o Carto.
- **Tabelas `*_arquivados` para histórico ❌.** Cleanup só deleta; quem precisa
  de histórico longo usa Relatórios. O WhatsApp do cliente mantém o histórico
  dele independentemente — nosso DELETE só apaga a cópia local.

## Lições aprendidas (cicatrizes)

- **Marcar fase como "concluída" antes de rodar a migration em produção** gera
  bug silencioso (código referencia tabela que não existe). Rodar
  `scripts/migrate.js` **imediatamente** ao mexer no schema, mesmo em dev.
- **`TRUNCATE ... CASCADE`** propaga ignorando `ON DELETE SET NULL` e arrasta
  logins — usar DELETE explícito (ver `limpar-dados-teste.sql`).
- **Cleanups em lote** com hard floor + `dry_run` + cap de lotes: um erro de
  digitação na retenção poderia apagar tudo; o piso protege.
- **`OTP_DISABLED` precisa de `.trim()`** — comentário inline no `.env`
  (`OTP_DISABLED=true   # ...`) quebrava a flag.
- **`Unexpected token '<', "<!DOCTYPE "` no front = o Express respondeu HTML.**
  Erros que não chegam às rotas (413/400 do body-parser, 404, 502 do proxy)
  caíam no handler padrão do Express, que responde uma página HTML — o
  `.json()` do front estourava e escondia o erro real. Custou tempo no envio de
  orçamento por e-mail: a assinatura de 7,6 MB virava POST de 10,1 MB e batia
  no limite de 8 mb do `express.json`. Hoje `src/app.js` tem handlers finais de
  404/erro em JSON. **Ao debugar "não é JSON válido", olhe o status HTTP e o
  `content-type` antes de suspeitar do front.**
- **Imagem grande: reduzir no cliente > aumentar o limite do servidor.**
  Subir o limite do `express.json` resolveria só o upload — o e-mail embute a
  assinatura como data URI e o Gmail apara mensagens acima de ~100 KB. Por
  isso `_avPrepararAssinatura` (canvas, 600 px, PNG com fallback JPEG)
  redimensiona antes de enviar: 7,6 MB → 89 KB, e o blob no banco também
  fica pequeno.
