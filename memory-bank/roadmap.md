---
tags:
  - projeto
  - contexto/roadmap
aliases:
  - Roadmap
---
# Roadmap

> Status: ✅ concluído · 🟡 em andamento · 📋 planejado · ⏸️ adiado · ❌ descartado.
> O "porquê" de cada decisão está em [`decisions.md`](decisions.md); o histórico
> técnico por migration está em [`../docs/changelog.md`](../docs/changelog.md).

## Linha do tempo das fases (já entregue)

| Fase | Tema | Status |
|---|---|---|
| 1 | Fundação WhatsApp (webhook, tabelas, sem IA) | ✅ |
| 2 | IA com function calling (gpt-4o-mini) | ✅ |
| 3A | Redesign dashboard (cards por condomínio) | ✅ |
| 3A.1 | Redesign visual "Mission Control" | ✅ |
| 3A.2 | Seção Telemetria avançada | ✅ |
| 3B | Mapa interativo Leaflet + geocoding híbrido + proxy de tiles | ✅ |
| 3C | Página /alertas unificada (telemetria + chamados) | ✅ |
| 3D | Ações recomendadas + análise IA + comentários | ✅ |
| 3E | Polimento da animação da sidebar | ✅ |
| 3F | WhatsApp como central de atendimento (Fases A-D) | ✅ |
| 4 | Integração telemetria automática (chamado anexa leitura) | ✅ |
| 5 | Polimento e gestão de conversas | ✅ |
| 6 | Hardening de segurança + configurações dinâmicas | ✅ |
| 7A-7F, 7H, 7I-A, 7K | App mobile Capacitor (técnico + cliente) + O.S. + GPS | ✅ |
| 7F-bg | GPS background no APK (`@capacitor-community/background-geolocation`) | ✅ |
| 7 (UI) | App mobile: camada visual HUD "Painel de comando" | ✅ |
| 8 | Analytics e SLA (métricas, SLA configurável, dashboard) | ✅ |
| 9C, 9E | Política de retenção + limpeza retroativa | ✅ |
| 10A | Curadoria de conversas resolvidas | ✅ |
| 11 | Política de criticidade P1–P4 e SLA de chegada | ✅ |
| 12A | Equipamentos: identidade + etiqueta QR + histórico | ✅ |

## Em andamento / pendente

- ✅ **RBAC: o operador virou restrição de verdade** (27/08/2026). 49 rotas
  saíram de `adminOnly` para `gestaoOnly` e o perfil saiu de `equipeInterna`;
  Contratos **e Dashboard** saíram do menu dele — o perfil ficou em quatro
  telas. Fecha a pendência aberta em 29/07/2026. Sobram 24 rotas, contra 118
  bloqueadas. Detalhe em
  [`../docs/modulos/autenticacao.md`](../docs/modulos/autenticacao.md).
  - 📋 **Confirmar em produção com um login `operador` real** — é backend, só
    vale após deploy, e nenhum teste automatizado cobre RBAC hoje.
  - ✅ **Superfície própria pro operador** (27/08/2026). A pergunta ("outra
    tese ou o admin podado?") foi respondida por **outra tese**: `/operador/painel`
    é a *fila do turno*, ordenada pelo SLA que estoura primeiro, com a evidência
    dentro do item. Arquivos próprios (`public/operador.*`), zero import de
    `admin.js`, e **um** endpoint novo (`GET /operador/fila`). Fluxo em
    [`../docs/modulos/painel-operador.md`](../docs/modulos/painel-operador.md).
    - ✅ **Aprovados vira porta de execução** (31/08/2026, migration 079).
      `/operador/painel/orcamentos` deixou de ser só leitura: clicar no
      orçamento abre o chamado que o executa, vinculado por
      `chamados.orcamento_id`. Fecha o buraco de "esse orçamento chegou a ser
      executado?", que antes não tinha onde ser respondido.
      - ⏳ **Rodar a migration 079 em produção** —
        `node scripts/migrate.js 079_chamado_orcamento.sql`. Sem ela o
        endpoint estoura no `INSERT` (lição da Fase 7E).
    - ✅ **Identidade alinhada com a landing e o painel do cliente**
      (27/08/2026, terceiro passe — o primeiro feito com as três telas abertas
      lado a lado). Fechou a faixa de 660–1090px, que não existia e onde a tela
      desmontava; a barra ganhou o `is-rolada` com `blur` das irmãs; sumiram as
      três peças de canto reto e os quinze ícones de ponta arredondada; a
      engrenagem ganhou máscara para parar de aparecer como dente solto entre
      os cartões.
    - 📋 **Chanfro: `--ch` local é morto nas CINCO folhas** (medido em 27/08).
      A rampa que o `DESIGN.md` descreve não renderiza em superfície nenhuma —
      cada tela tem um chanfro só. Conserto é nas cinco de uma vez, senão a
      folha consertada vira a fora do padrão. Mesmo raciocínio da rampa de tipo.
    - 📋 **Nunca rodou sob a role real** — exercitada com JWT assinado à mão
      contra o banco de teste; o visual não foi visto logado.
    - 📋 Coluna `origem` em `chamados`: hoje a procedência do chamado é
      deduzida por efeito colateral (`conversa_id`, `plano_manutencao_id`,
      categoria automática), e um `nivel_baixo` aberto à mão aparece como
      "telemetria".
    - 📋 ETA no despacho — o cartão do candidato mostra "no mapa"/"—", não
      distância nem tempo. ⚠️ No **trilho** essa nota já saiu (31/08); aqui ela
      continua porque o diálogo de despacho ainda não passou pelo corte, e é
      justamente onde a distância teria valor.
    - 🟡 **Simplificar a tela para quem vai usar** — pedido do Pedro: pessoas
      mais velhas, com pouca familiaridade com computador. A régua é *o que sai
      da tela*, não *quanto cresce* (o passe de escala foi devolvido com "não
      mudou praticamente nada"). ✅ o **item da fila** (28/08), o **trilho**
      (31/08, 4 peças por linha → 2) e o **placar de 3 números** (31/08, saiu
      da tela; a engrenagem de fundo mudou de casa junto — da faixa horizontal
      do topo para dentro do trilho, abraçando o mapa) e os **pinos do mapa**
      (31/08, duas escalas: no mapa largo — tela cheia ou abaixo de 1180 — eles
      crescem, porque 22px desenhados para a coluna de 400 somem numa janela de
      1900). 📋 falta a **ficha**, o **diálogo de despacho** e **"Já tem
      técnico"**. A fila detalhada e as pendências de copy que são decisão do
      Pedro estão em [`active-work.md`](active-work.md).

- ✅ **Migrations 077 e 078 aplicadas em produção** (26/08/2026). A 078
  (`resposta_tratada_em`/`resposta_tratada_por`) era pré-requisito do painel
  novo de orçamentos: sem ela, o `SELECT` da lista derruba a aba inteira.
  Rodaram **antes** do deploy do código, que é a lição da Fase 7E no
  [`../CLAUDE.md`](../CLAUDE.md).

- **Fase 12 — Equipamentos e bancada da oficina** 🟡 — 12A entregue em
  2026-08-17 na branch `feature/equipamentos-qr`. Fluxo e pegadinhas em
  [`../docs/modulos/equipamentos.md`](../docs/modulos/equipamentos.md).
  - ✅ **12A (identidade)**: migration 070, router `/equipamentos`, folha A4 de
    etiquetas QR, ficha `/e/:codigo` e seção Equipamentos no admin. Responde
    "de quem é essa bomba e o que ela tem", que era a dor original.
  - ✅ **Migration 070 aplicada em teste e em produção** (2026-08-17,
    `--prod`). Lembrete: em dev o `migrate.js` vai pro banco de teste por
    padrão — produção exige a flag `--prod` (ver `src/db-url.js`).
  - 📋 **`PUBLIC_BASE_URL` nas envs do Railway** — sem ela o gerador de
    etiquetas recusa imprimir (deriva a URL do request e barra host local).
    É pré-requisito pra primeira folha real sair da impressora.
  - ✅ **12B (orçamento da bancada)** — 2026-08-18, migration 071. Botão
    "Solicitar orçamento" na ficha cria `orcamentos` com `origem = 'bancada'` e
    as peças como linhas; aprovar ou recusar no painel move a bomba de volta
    (`em_conserto` / `oficina`). Verificado ponta a ponta no banco de teste.
    Migration 071 aplicada em teste e **produção** (18/08).
  - 📋 **12B-2 (painel da bancada)**: a lista por estado com **dias parados** —
    a tela que responde "o que está parado na oficina e por quê" sem escanear
    bomba por bomba. Hoje isso só se vê uma bomba de cada vez, pela ficha.
  - ✅ **12C (O.S. no circuito)** — 2026-08-18, migration 072.
    `ordens_servico.equipamento_id`, seletor no modal de O.S., propagação do
    vínculo para o orçamento e reflexo da aprovação na bancada.
    Migration 072 aplicada em teste e **produção** (18/08) — inclui o `UPDATE`
    que acertou `orcamentos.origem = 'os'` nos orçamentos nascidos de O.S.

  - 📋 **12D (opcional, depois de 31/08)**: scanner dentro do app
    (`@capacitor-mlkit/barcode-scanning`), inventário do parque instalado,
    alerta de garantia.

- **Landing pública** 🟡 — redesenhada em 2026-08-11 na branch
  `feature/landing-publica` (direção "Chapa"; a primeira versão, em formato de
  demonstrativo de despesas, foi rejeitada). Em 2026-08-13 a linha do tempo da
  madrugada foi trocada por uma chamada única de 24 h e toda a copy passou para
  primeira pessoa do plural. Fluxo e pegadinhas em
  [`../docs/modulos/landing-publica.md`](../docs/modulos/landing-publica.md).
  Pendente antes do merge:
  - **Preço / termos da assinatura** — Pedro definiu "assinatura mensal, sem
    vagas limitadas", mas o **valor não existe**. A página fala em proposta caso
    a caso e **não cita número nenhum**. Não inventar.
  - **Texto de LGPD** sob o botão de envio — escrito para descrever só o que
    `leads.routes.js` faz; falta o Pedro validar.
  - **"400+ avaliações cinco estrelas no Google"** continua não verificada e por
    isso está fora da página (ver `PRODUCT.md`).
  - `POST /leads` **não foi exercitado contra o backend real** nesta sessão —
    só a validação de campo vazio no front.
- **Painel do cliente** 🟡 — **v3 implementada em 14/08**, a partir da comp
  [`../docs/comps/painel-cliente-v3.html`](../docs/comps/painel-cliente-v3.html).
  A v1 (13/08) foi rejeitada por manter a casca do admin; a v3 removeu
  navegação, KPIs, abas, buscas e tabelas, e tudo que sobrou virou ficha.
  Fluxo e pegadinhas em
  [`../docs/modulos/painel-cliente.md`](../docs/modulos/painel-cliente.md);
  estratégia em `.impeccable/surfaces/public-cliente-html.md`.
  Pendente antes do merge:
  - **Abrir com backend real** (servidor de teste + conta de cliente demo). Até
    aqui só houve harness estático — 8 estados × 2 tamanhos, `fetch` dublado.
  - **Ver o cliente sem telemetria contratada com um cliente real** (sem
    reservatórios no banco). No harness o caminho renderiza.
  - **Decidir o âmbar no estado "atenção"**: ali a palavra que nomeia o
    problema, o número, o anel do tanque **e** o botão são todos âmbar — quatro
    regiões, contra a regra de "uma vez por tela". Veio assim da comp aprovada;
    não mexi sozinho.
  - 📋 **`ja_avaliado` no `SELECT` de `GET /cliente/chamados`** — uma linha
    (`(ch.avaliacao_nota IS NOT NULL) AS ja_avaliado`) elimina as requisições
    de detalhe que hoje existem só para saber se o convite a avaliar aparece na
    história. Aditivo, sem rota nova, sem tocar no `sw.js`.
  - 📋 **`alertas_recentes` em `/cliente/status`** — alertas resolvidos dos
    últimos 30 dias, para a história parar de mostrar alerta que abre e nunca
    fecha. Aditivo: sem rota nova, sem tocar no `sw.js`. Aguarda o Pedro
    liberar mexer no backend.
  - 📋 **O prédio em corte** ([`../docs/comps/predio-em-corte.html`](../docs/comps/predio-em-corte.html))
    continua como exploração, não como decisão: exige campo novo de posição do
    reservatório no banco.
- **Gateway Meta WhatsApp** — código pronto, pendente configuração externa
  (ver [`active-work.md`](active-work.md)).
- **Fase 10 (treinar IA)** 🟡 — 10A feito; 10B-E aguardam ~500+ conversas
  curadas.
- **7G — Push notifications nativas** 📋 — **destravada**: não depende da 7J
  (ver seção própria abaixo). Pedido do usuário em 2026-07-28.
- **7J — Publicação Play Store** 🟡 — **prazo firme: 31/08/2026** (target API 36
  obrigatório para apps novos e atualizações; extensão possível até 01/11/2026).
  - ✅ Upgrade Capacitor 6 → 8 feito em 2026-07-28 (`targetSdk 36`, AGP 8.13.0,
    Gradle 8.14.3) — ver [`../docs/changelog.md`](../docs/changelog.md).
  - 📋 Pendente: teste do GPS background em aparelho real; keystore de release +
    `signingConfig`; `versionCode`/`versionName` reais (hoje `1` / `"1.0"`);
    build `bundleRelease` (.aab); política de privacidade; e o **formulário de
    declaração de permissão de localização em background da Play Store**, que
    exige vídeo demonstrativo e passa por revisão manual.

- **Onboarding de permissão de localização em background** 📋 — em 2026-08-04 o
  app passou a **avisar** quando a permissão é só "ao usar o app" (chip "Sem
  permissão" + texto com o caminho). Falta a outra metade: detectar na abertura
  e oferecer um atalho para as Configurações do sistema
  (`ACTION_APPLICATION_DETAILS_SETTINGS`, como já é feito em
  `requestBatteryExemption`). Sem isso cada técnico precisa ser instruído na
  mão — hoje só o técnico de teste (id 9) tem a permissão correta. Encosta no
  formulário de declaração da Play Store da 7J.

- **Varredura de responsividade do admin em telas pequenas** 🟡 — em 2026-08-05
  foi corrigido o **recorte de controles** em toolbars (`.cardHead`,
  `.wa-tabs`, `.mp-tabs`), que escondia botões e filtros entre ~1280px e
  1536px em 6 abas. A varredura automatizada (harness estático + Puppeteer,
  ver [`../docs/changelog.md`](../docs/changelog.md)) cobriu **overflow
  horizontal**; ficou de fora o que ela não mede:
  - **Altura** — tabelas e modais longos em 768px de viewport.
  - **Painel do cliente** (`public/cliente.css`) — a varredura só rodou no
    admin, e o redesenho do painel do cliente mira justamente o navegador.
  - Faixa estreita entre ~1100px e ~1223px, onde a toolbar de telemetria
    ainda usa 3 linhas (nada some, só fica mais alta).

- **Orçamento respondido pelo cliente** 🟢 — a tela está em produção
  (`/cliente/painel/orcamentos`) e virou o caminho padrão:
  1. ✅ **migration 074 aplicada em produção** em 24/08/2026;
  2. ✅ **convite religado** em 25/08/2026 — agora é padrão, e
     `ORCAMENTO_LINK_PAINEL=0` é que desliga;
  3. ✅ **e-mail com link não leva mais o PDF anexado** (25/08/2026).
  4. ✅ **os dois modos de envio ganharam templates separados** (27/08/2026)
     — `carta` saía embrulhada na moldura do estruturado; agora é só o
     texto do operador e a assinatura dele.

  Falta percorrer a tela logado com calma — aprovar, recusar (exige comentário)
  e o retorno do `next=` do login — e ver o primeiro envio real chegar.

  Fica de fora por escopo: **pessoa física não responde por aqui** — quem não
  tem condomínio não tem login. Ainda sem aviso ao escritório quando a resposta
  entra (hoje só aparece no admin quem for olhar).
- **Padronização visual dos modais do admin** 🟡 — o modal de orçamento é a
  referência e o padrão está se espalhando um modal por vez.
  - ✅ 2026-08-05: camada compartilhada (`.modalBox` com fio no topo,
    `.is-perigo`, `.modal-sec-title`, `.modalFoot-danger`, `.modal-2col`,
    `.is-sobreposto`) + 8 cascas inline convertidas. Restam 0 cascas inline.
  - ✅ 2026-08-06: **Editar condomínio** reestruturado; nasceu daí a casca
    `.modalBox.is-split` / `.modal-split` / `.modal-rail` — janela de altura
    fixa com trilho, generalizada a partir do `#avModal`.
  - 📋 **Próximos candidatos ao trilho** (muito campo + algo que precisa ficar
    à vista): **Contrato** (`#ctrOverlay`, 1000px, o painel de assinatura rola
    junto), **O.S.** (`#osModalOverlay`) e **Editar reservatório**
    (`#editResOverlay`, onde a device key e o "Nova chave" competem com 7
    campos de calibração).
  - 📋 Falta rodar os modais reestruturados **contra o backend real** — tudo
    até aqui foi verificado em harness estático (markup real + CSS real, sem
    Leaflet e sem dados do banco).

- **SLA de chegada nunca saiu do papel** 📋 — a Migration 028 criou
  `sla_definicoes.sla_chegada_min` (P1=180min, P2/P3=1440/4320, P4=NULL) e as
  colunas `tecnico_a_caminho_em`/`tecnico_chegou_em`, mas nada consome: a tela
  Configurações › SLA só edita TTFR/TTR (o PATCH manda só os dois) e nenhuma
  query calcula estouro de chegada. Enquanto isso
  [`../docs/modulos/chamados-sla.md`](../docs/modulos/chamados-sla.md) afirma
  que "SLA mede chegada do técnico, não resolução" — hoje o código mede o
  contrário. Achado em 2026-08-06, ao corrigir o TTFR de atribuição.

- **Recalibrar o reservatório de teste (`Res_Gen_Sup`)** 📋 — a escala satura:
  `adc_zero=603` + `adc_por_metro=462` × `altura_total_m=0.50` faz **ADC 834 já
  ser 100%**, e 25 de 76 amostras cruas do Serial Monitor passam disso (máx.
  850 ≈ 107%), achatadas pelo `Math.min` de `calcularNivelPct`. Em 48h foram 75
  leituras acima do topo, até 35 counts (~7,6 cm de coluna d'água). O método de
  calibração usado está correto (sonda fora d'água para o zero,
  `(cheio − vazio) / 0,50` para a inclinação) — o ponto "cheio" é que foi
  capturado com a caixa abaixo do máximo de operação. Efeito: escala ~13%
  comprimida, o sistema alerta aos ~17% reais em vez de 20% (conservador, não
  perigoso). Correção: refazer o ponto "cheio" com a caixa no máximo e tirar
  cada ponto como **média de ~10 leituras** (uma leitura isolada carrega ±3,9
  counts de ruído = ±1,7% de nível). Achado em 2026-08-06.
  - ❌ **Não é** ruído de amostragem do firmware: a série crua dá autocorrelação
    -0,127 (ruído branco) e tem amostras consecutivas idênticas — não há
    aliasing, o `delay(20)` do `lerSonda()` está adequado.
  - ⚠️ **Armadilha:** não medir ruído pela tabela `leituras`. O write-threshold
    só grava o que saltou ≥5%, o que inflou a estimativa de ±1,7% para ±6,9% e
    fabricou uma falsa "alternância sistemática" (autocorrelação -0,434).

## Descartado (decisões conscientes)

- **9A — Tabela agregada horária** ❌ — write-threshold já reduz volume o
  suficiente; agregação on-the-fly por bucket atende.
- **9B — Tabela agregada diária** ❌ — mesmo motivo.
- **9D — Adaptar queries para tabelas agregadas** ❌ — sem as tabelas, sem
  necessidade.
- **WebSocket no WhatsApp** ⏸️/❌ — polling de 5s suficiente para o volume atual.
- **leaflet.markercluster** — adiado até o nº de condomínios justificar.

## Backlog de schema (já resolvido)

- Sistema de orçamentos **unificado** (Migration 030 — eliminou os dois sistemas
  paralelos A e B).
- FK bidirecional `chamados ↔ ordens_servico` redundante removida (Migration 034).
- `mensagens_whatsapp.ia_urgencia` migrado para p1-p4 (Migration 031).
- Tabelas `planos_manutencao` (032), `historico_chamados` (033), `contratos`
  (035) criadas.
- Encaminhamento de orçamento via IA (036), contexto cliente B2B vs PF (037),
  pré-cadastro de contatos WhatsApp (037).
- State machine de conversa (042), anti-loop (041), canal (043).
- Orçamento avulso de serviço — limpeza de reservatório de água potável,
  dedetização, ou combo dos dois (Migration 060, `orcamentos.tipo`),
  mesma tabela/timbrado do orçamento de peças mas PDF descritivo por
  cláusulas (Objeto/Escopo/Garantia) com valores separados no final.
- Valor unitário opcional em item de orçamento de peças + total manual
  (Migration 062, `orcamento_linhas.valor_unitario` nullable) — item sem
  preço lançado some da coluna de valor no PDF em vez de "R$ 0,00";
  `orcamentos.valor` vira override manual do total quando a soma automática
  não reflete o total real.

- FKs de autoria → `usuarios` sem `ON DELETE` (023, 026, 030, 032, 035)
  convertidas para `ON DELETE SET NULL` (Migration 073) — eram o que impedia
  remover qualquer usuário que já tivesse criado ou aprovado algo.

## Push notifications no app (Fase 7G) — planejado 📋

**Contexto:** pedido do usuário em 2026-07-28 — o técnico não fica sabendo de
chamado novo. Hoje o app **não tem notificação nenhuma**: o único mecanismo é o
polling de 30s em `app/public/app.js` (`TC.polling`), que só roda **enquanto a
tela de chamados está aberta**. Celular no bolso = técnico não sabe de nada.

**Correção de premissa:** esta fase estava marcada como "⏸️ depende da 7J
(publicação nas lojas)". **Não depende** — FCM funciona em APK instalado na mão,
sem loja. A dependência era falsa e travava a fase à toa.

**Decisão de abordagem:** push real via **FCM**, não notificação local disparada
pelo polling. O porquê está em [`decisions.md`](decisions.md#app-mobile).

**Escopo no código:**
- Plugin `@capacitor/push-notifications`; registro do token do aparelho no login
  e limpeza no logout.
- Migration nova: tabela de tokens por técnico (um técnico pode ter mais de um
  aparelho; token do FCM rotaciona, então precisa de upsert + expurgo dos
  inválidos devolvidos pelo envio).
- Serviço de envio no backend, disparado quando um chamado **ganha
  `tecnico_id`**. São **três** caminhos, todos precisam do gatilho:
  1. atribuição manual (`PATCH /chamados/:id`);
  2. chamado automático de telemetria (`abrirChamadoAuto` em
     `src/services/chamados.service.js`);
  3. preventiva de plano (`executarPlano` em `src/jobs/planos-manutencao.job.js`,
     quando a zona resolve um responsável).
- Permissão `POST_NOTIFICATIONS` em runtime — obrigatória desde o Android 13 e
  inescapável agora que o app targeta API 36.

**Pré-requisitos externos (fora do código):**
1. Projeto no Firebase + `google-services.json` em `app/android/app/`.
2. Credencial de servidor do FCM nas envs do Railway.

Facilitador já pronto: `app/android/app/build.gradle` aplica o plugin
`com.google.gms.google-services` **se** o `google-services.json` existir — o
bloco está lá desde o início, nunca foi usado.

**Ordem sugerida:** fechar a 7J primeiro (o app precisa estar publicável e com o
GPS validado); push é feature nova e não deve competir com o prazo de 31/08.

## Nota fiscal (NFS-e) — planejado 📋

**Contexto:** emissão de NFS-e (Nota Fiscal de Serviço Eletrônica) vinculada
ao orçamento aprovado. Viável via gateway que abstrai as APIs municipais.

**Como funcionaria no sistema:**
- Botão "Emitir NFS-e" no orçamento aprovado → chama API do gateway → salva número, XML e PDF da nota vinculados ao orçamento/cliente.
- Reenvio por e-mail junto com o PDF do orçamento (Resend já integrado).
- Campo `nota_fiscal_numero`, `nota_fiscal_pdf_url`, `nota_fiscal_emitida_em` na tabela `orcamentos` (nova migration).

**Gateways candidatos:** Focus NFe, eNotas, NFe.io (~R$0,10–0,50/nota).
Todos expõem REST simples; a integração no backend é de 1–2 dias após setup.

**Pré-requisitos externos (fora do código):**
1. CNPJ ativo com regime tributário definido (contador).
2. Contratação e configuração do gateway (chave API + dados fiscais).
3. Credenciais do município (alguns exigem login no portal da prefeitura).

**NF-e de produto:** possível no futuro se houver venda de peças além do
serviço. Mais padronizada (SEFAZ federal) mas exige certificado digital A1.

---

## Backlog futuro (ideias não-MVP já mapeadas)

Itens levantados durante o desenvolvimento, conscientemente deixados para
depois. Nenhum é bloqueante.

- **Job de email de renovação de contrato** (60/30/15 dias antes de `fim_em`) —
  Resend já integrado, é trivial adicionar.
- **Notificação à equipe comercial** quando entra orçamento `origem='ia'
  status='rascunho'` (hoje só aparece na aba; falta email/push ativo).
- **Histórico de contratos** do mesmo condomínio (listar inativos) — basta o
  filtro `?ativo=false&condominio_id=X` no endpoint atual.
- **Carimbo do tempo de terceiro independente pra assinatura de contratos** —
  hoje a evidência (protocolo/IP/hora) usa só o relógio do próprio servidor.
  Toda autoridade certificadora acreditada ICP-Brasil (RFC 3161) é paga; se
  quiser reforçar sem custo, dá pra avaliar algo como OpenTimestamps (âncora
  em blockchain, gratuito, mas com confirmação não-instantânea). Ver
  [`decisions.md`](decisions.md#segurança-e-rbac).

## Visão de produto de longo prazo

- IA especializada no domínio via few-shot → fine-tuning (Fase 10).
- App nas lojas com push nativo.
- Possível: multi-empresa white-label, health do device (qualidade de sinal),
  múltiplas sondas por reservatório (itens do roadmap original do README).
