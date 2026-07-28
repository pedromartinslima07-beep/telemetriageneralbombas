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

## Em andamento / pendente

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

- **Tabela `equipamentos`** — hoje só `reservatorios` tem identidade no sistema;
  bombas, motores e painéis não. `os_pecas` registra "trocou bomba X" mas não
  vincula a um equipamento físico. Colunas sugeridas: `condominio_id`, `tipo`,
  `marca`, `modelo`, `numero_serie`, `instalado_em`, `garantia_ate`.
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
