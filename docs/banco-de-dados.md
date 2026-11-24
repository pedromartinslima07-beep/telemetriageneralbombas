---
tags:
  - projeto
  - doc/banco
aliases:
  - Banco de Dados
  - Schema
---
# Banco de Dados

PostgreSQL 18 (Railway em produção). Acesso via pool `pg` (`src/db.js`), que
aceita `DATABASE_URL` (preferido, com SSL `rejectUnauthorized:false`) ou as
variáveis `PG*` separadas. Pool: `max=20` (env `PG_POOL_MAX`), idle **10 min**
(env `PG_IDLE_MS`; era 30 s até 19/11/2026), `keepAlive`, connection timeout 5s.
⚠️ Abrir conexão com o Postgres remoto custa ~2,4 s medidos da máquina de dev
até o banco de teste (uma consulta, ~0,34 s); com idle de 30 s, tela que
dispara várias consultas juntas pagava a abertura a cada volta. Ver
[redesenho-admin.md](modulos/redesenho-admin.md) (item 9 da ronda de UX).

- **Schema base:** `database/schema.sql` (dump das 7 tabelas originais).
- **Evolução:** `migrations/001..073` (numeradas, **ativas**), aplicadas com
  `node scripts/migrate.js NNN_nome.sql` (lê `DATABASE_URL`). Todas idempotentes
  (`IF NOT EXISTS` / `IF EXISTS`).
- `database/migrations/` contém os arquivos datados do schema original
  (2026-03/04) — histórico, não é o fluxo ativo.
- Todos os timestamps são `timestamptz` (timezone-aware).

> ⚠️ **Nunca usar `TRUNCATE ... CASCADE`** em scripts de limpeza: propaga para
> todas as tabelas com FK ignorando `ON DELETE SET NULL` e arrasta logins.
> Use `DELETE` explícito (`migrations/limpar-dados-teste.sql`).

---

## Diagrama de relacionamentos

```
condominios ─┬─ reservatorios ──< leituras            (device_id)
             ├─ usuarios (condominio_id, SET NULL)
             ├─ chamados ─┬─< historico_chamados
             │            ├── ordens_servico ─┬─< os_fotos
             │            │                   └─< os_pecas
             │            └── (conversa_id, tecnico_id, plano_manutencao_id)
             ├─ conversas_whatsapp ──< mensagens_whatsapp
             │        └── clientes_whatsapp (telefone → condominio/usuario)
             ├─ planos_manutencao ──> (gera chamados P4)
             ├─ contratos
             └─ orcamentos ─┬─< orcamento_linhas
                            └── (os_id, condominio_id)

usuarios ─┬─ login_codes (OTP)         tecnicos ──> usuario_id (1:1)
          ├─ trusted_devices (cookie)      └─ tecnico_localizacoes (GPS atual)
          └─ (autor em vários históricos)  └─ tecnico_localizacoes_historico

equipamentos ─┬─< equipamento_movimentacoes   (código do QR; condominio_id
              ├─< equipamento_fotos            nullable até a etiqueta ser
              └── (chamados.equipamento_id)    vinculada)

alertas (telemetria; chave por device_id)   alerta_comentarios (telemetria|chamado)
configuracoes (key-value dinâmico)           sla_definicoes (p1-p4)
```

---

## Tabelas

### Núcleo (telemetria) — `database/schema.sql`

**`condominios`** — entidade central (cliente B2B / PF).
`id`, `nome` (razão social, obrigatório), `endereco`, `bairro`, `cidade`,
`uf(2)`, `responsavel`, `telefone`, `observacoes`, `ativo`, `criado_em`.
Migrations acrescentam: `lat`/`lng NUMERIC(9,6)` (002), `cep VARCHAR(8)` (003),
`cnpj VARCHAR(18)`, `nome_fantasia TEXT` (044 — nome principal de exibição;
quando preenchido substitui `nome` na UI; `nome` permanece como razão social).

> ⚠️ **Ler `nome_fantasia` é `COALESCE(NULLIF(c.nome_fantasia,''), c.nome)`, com
> o `NULLIF`** — fantasia salvo como string vazia passa pelo `COALESCE` e
> apagaria o nome da tela. **71 dos 86** cadastros em produção têm os dois
> campos diferentes, então errar isso troca o nome do cliente, não é detalhe:
> em orçamentos o painel mostrava a razão social e o PDF o fantasia até 02/09
> ([changelog](changelog.md)). Metade do sistema (chamados, O.S., contratos,
> relatórios, WhatsApp, alertas) ainda lê `c.nome` puro — ver o pendente no
> [roadmap](../memory-bank/roadmap.md).

`email` (045 `VARCHAR(255)` → 047 `TEXT`): um ou mais e-mails separados por
vírgula, usados como destinatário no envio de orçamentos.

**`reservatorios`** — 1:N com condomínio. Calibração da sonda fica aqui.
`id`, `condominio_id (FK CASCADE)`, `nome`, `tipo`, `device_id UNIQUE`,
`device_key`, `ativo`, `last_seen`, `altura_total_m`, `adc_zero`,
`adc_por_metro`, `faixa_sonda_m`, `limiar_bomba`,
`altura_extravasor_m` (106 — altura do ladrão na referência de
`altura_total_m`; NULL = detecção de extravasamento desligada),
`extravasor_desde` / `extravasor_bomba_desde` (106 — desde quando o nível está
no ladrão, e no ladrão com a bomba ligada; o relógio da regra de tempo, ver
[telemetria.md](modulos/telemetria.md#extravasamento)).
Índice: `idx_reservatorios_condominio_id`.

**`leituras`** — série temporal das medições do ESP32.
`id`, `device_id`, `nivel`, `bomba_ligada`, `nivel_pct (0-100)`, `adc_raw`,
`bomba_rms`, `criado_em`.
Índice: `idx_leituras_device_criado (device_id, criado_em DESC)`.

**`alertas`** — alertas de telemetria (offline, nível). Chaveados por device.
`id`, `device_id`, `tipo`, `mensagem`, `status('aberto')`, `criado_em`,
`atualizado_em`.
Índice **parcial único** `uniq_alerta_aberto (device_id, tipo) WHERE
status='aberto'` — garante 1 alerta aberto por device+tipo (upsert idempotente).

**`usuarios`** — `id`, `nome`, `email UNIQUE`, `senha_hash` (bcrypt), `role`,
`condominio_id (FK SET NULL)`, `criado_em`, `telefone` (migration 001).

> ⚠️ **`senha_hash` de `role='cliente'` é lixo criptográfico de propósito**
> (25/08/2026). O síndico entra por e-mail + código, sem senha — mas a coluna
> é `NOT NULL` e continua sendo: em vez de migration, o cliente nasce com o
> bcrypt de 32 bytes aleatórios que ninguém conhece. Ou seja, **hash presente
> não significa senha existente**: para cliente, o `/auth/login` com senha
> nunca vai casar, e isso é o comportamento desejado. Ver
> [modulos/autenticacao.md](modulos/autenticacao.md).

> ⚠️ `condominio_id` é `ON DELETE SET NULL`: **apagar o condomínio não apaga o
> login**. Sem tratamento, sobra uma credencial válida sem vínculo — a pessoa
> autentica e o painel responde 403 "Cliente sem condomínio vinculado".
> Por isso `DELETE /condominios/:id/hard` apaga os `role = 'cliente'` do
> condomínio **antes** de apagar o condomínio: depois do `SET NULL` não há mais
> como saber quem era de lá. Detalhes em
> [`modulos/autenticacao.md`](modulos/autenticacao.md).
>
> O `condominio_id` também viaja **dentro do JWT**, então alterá-lo no banco só
> vale para a próxima sessão — a atual continua com o valor antigo.
CHECK role: `admin | admin_viewer | cliente | tecnico` (migration 017 adicionou
`tecnico`; o antigo `master_admin` foi removido).

**`login_codes`** — OTP 2FA. `usuario_id (CASCADE)`, `code CHAR(6)`,
`expires_at`, `used`, `tentativas SMALLINT` (migration 075). O `tentativas`
existe porque o rate limit por IP não protege o código: quem tem muitos IPs
compra chutes à vontade dentro dos 10 minutos de validade. Ao 5º erro o código
é queimado (`used = TRUE`) e a pessoa precisa pedir outro — o teto passa a ser
do código, não de onde vieram as tentativas.
⚠️ `code` é `CHAR(6)`, e CHAR volta do Postgres **com padding de espaço**:
comparar em JS sem `trim` reprova todo código legítimo.
**`trusted_devices`** — `usuario_id`, `token UNIQUE`, `expires_at` (cookie de
30 dias).

### WhatsApp + IA — migration 001 (+ evolução)

**`clientes_whatsapp`** — mapeia telefone → condomínio/usuário.
`telefone UNIQUE`, `nome`, `condominio_id`, `usuario_id`.
Migration 037: `tipo (gestao_condominio|pessoa_fisica|desconhecido)`,
`cadastrado_por`, `observacoes`.

**`conversas_whatsapp`** — uma sessão de atendimento.
`cliente_whatsapp_id (CASCADE)`, `status`, `criado_em`, `fechado_em`.
Evolução das colunas:
- 005: `assumida_por_id`, `assumida_em` (humano assume → IA cala)
- 007: status CHECK passa a `aberta|em_atendimento|fechada`
- 038: `qualidade_atendimento (excelente|boa|aceitavel|ruim)`,
  `qualidade_avaliada_em`, `qualidade_avaliada_por` (curadoria p/ treino IA)
- 039: `aguardando_atendente BOOL`
- 040: `aguardando_avaliacao BOOL`
- 041: `ia_sem_avanco SMALLINT` (contador anti-loop)
- 042: `estado_conversa VARCHAR(30) DEFAULT 'triagem'` + `pendente_acao JSONB`
  (state machine)
- 043: `canal VARCHAR(20) DEFAULT 'whatsapp'`

**`mensagens_whatsapp`** — `conversa_id (CASCADE)`,
`evolution_message_id UNIQUE` (idempotência), `direcao (entrada|saida)`,
`conteudo`, `tipo`, `ia_categoria`, `ia_urgencia`, `ia_resumo`, `criado_em`.
- 006: `lida_em TIMESTAMPTZ` (mensagens não-lidas)
- 031: `ia_urgencia` CHECK migra de `baixa/media/alta/emergencia` → `p1..p4`

### Chamados, técnicos, O.S. — migrations 001, 008, 015...

**`chamados`** — chamado de suporte (manual, do cliente ou da IA).
`id`, `conversa_id (SET NULL)`, `condominio_id (SET NULL)`, `status
(aberto|em_atendimento|fechado|cancelado)`, `prioridade`, `titulo`, `descricao`,
`responsavel_id`, `criado_em`, `atualizado_em`, `fechado_em`.
Evolução:
- 002: `categoria (vazamento|bomba_falha|nivel_baixo|sem_agua|ruido|manutencao|outro)`
- 009: `tecnico_id (FK tecnicos)`
- 020: `avaliacao_nota (1-5)`, `avaliacao_comentario`, `avaliacao_em`
- 021: `alerta_atraso_enviado_em`
- 022: `primeira_resposta_em`, `tempo_resolucao_seg` (SLA). `primeira_resposta_em`
  é escrita sempre com `COALESCE(primeira_resposta_em, NOW())` — primeira
  escrita ganha; a lista de gatilhos está em
  [chamados-sla.md](modulos/chamados-sla.md)
- 028: prioridade CHECK migra para `p1|p2|p3|p4` (default `p3`) +
  `tecnico_a_caminho_em`, `tecnico_chegou_em` (SLA de chegada)
- 032: `plano_manutencao_id`
- 083: `status` aceita `cancelado` + `cancelado_em`, `cancelado_motivo` — ver
  a entrada da migration 083 abaixo e
  [chamados-sla.md](modulos/chamados-sla.md)
- 079: `orcamento_id (SET NULL)` + `idx_chamados_orcamento` (parcial) — o
  chamado que EXECUTA um orçamento aprovado. **Não é UNIQUE de propósito:**
  um orçamento pode gerar mais de um chamado (o serviço volta); quem impede
  o clique duplo é o `POST /operador/orcamentos/:id/chamado`, que devolve o
  chamado aberto existente em vez de criar outro. Ver
  [painel-operador.md](modulos/painel-operador.md)
- 087: `competencia DATE` (CHECK dia 1; nulo em chamado que não é preventiva)
  + `idx_chamados_plano_competencia` (parcial) — **o mês que o chamado de
  preventiva paga**, e o título ganha o mês ("Preventiva — outubro/26").
  O despacho e a baixa à mão só mexem no chamado da competência deles; o de
  mês encerrado que ninguém começou é **cancelado na virada**
  (`cancelado_motivo` = "Preventiva de setembro/26 não realizada…"). Ver
  [painel-operador.md](modulos/painel-operador.md)
- (015 criou `ordem_servico_id`, removido em 034 — FK redundante)

**`tecnicos`** (008) — `id`, dados do técnico. 016: `usuario_id UNIQUE (FK)`
liga técnico ao login. 029: perfil (`foto_url`, `cpf`, `rg`,
`data_nascimento`, `endereco`, `observacoes`).

**`tecnico_localizacoes`** (016) — GPS atual: `tecnico_id PK`, lat/lng, ts.
**`tecnico_localizacoes_historico`** (016) — trilha GPS (limpa por job).

**`ordens_servico`** (015) — O.S. digital. `chamado_id (SET NULL)`,
`condominio_id`, `tecnico_id (SET NULL)`, dados de execução, `finalizada_em`.
018: `orcamento_necessario BOOL`, `orcamento_observacoes`. (As colunas
`orcamento_*` formais de 024/025 foram removidas em 030 — ver orçamentos.)
081: `sincronizada_em TIMESTAMPTZ` — ver a migration 081 abaixo.
086: `enviado_em TIMESTAMPTZ`, `enviado_para TEXT` — rastreio do envio da O.S.
por e-mail ao cliente. **Mesmos nomes que `orcamentos` usa desde a 047**: é o
mesmo fato sobre outro documento, e nome diferente para a mesma coisa custa uma
consulta ao schema toda vez. Ver
[envio da O.S.](modulos/ordens-servico.md).
088: `assinatura_refazer_em TIMESTAMPTZ` (o escritório pediu nova assinatura;
NULL = nada pendente — é o que acende o botão no app do técnico) e
`assinatura_refeita_em TIMESTAMPTZ` (quando a nova chegou; fica para sempre e o
PDF imprime). ⚠️ **`assinatura_b64` preenchido não quer dizer assinado**: a
OS-2026-0139 tinha um PNG transparente. "Tem assinatura" é ter tinta —
`assinaturaTemTinta` em `src/services/assinatura-tinta.service.js`.
⚠️ **`chegada_lat`/`chegada_lng` são NULÁVEIS de propósito, e desde
11/09/2026 isso acontece na prática.** O técnico pode iniciar o atendimento
sem sinal — subsolo e casa de máquinas são onde ele trabalha — e a coluna
guarda a ausência em vez de o sistema recusar o atendimento. `chegada_em`
continua sempre preenchida: a hora é fato, o lugar não. Quem lê essas
colunas precisa tratar NULL como **"sem GPS"**, que é o que a ficha da O.S.
no admin escreve. Contraste com **`tecnico_localizacoes.lat/lng`, que são
NOT NULL** (016) — é por isso que `iniciar-atendimento` só escreve lá quando
há coordenada. Ver [ordens de serviço](modulos/ordens-servico.md).

**`os_fotos`** (015, CASCADE) — `id`, `os_id`, `url`, `tipo`, `legenda`, `criado_em`.
053: `dados_base64 TEXT` — conteúdo da imagem como data URL (`data:image/jpeg;base64,...`). Armazenado no banco para sobreviver a restarts do Railway (filesystem efêmero). Upload salva aqui; novo endpoint `GET /ordens-servico/:osId/fotos/:fotoId/imagem` serve o binário.
**`os_pecas`** (015, CASCADE).

### Orçamentos — sistema unificado (migration 030)

**`orcamentos`** (criada em 026) — `id`, `condominio_id`, `criado_por`,
`status`, valores. 027: `os_id (FK SET NULL)`. 030 unificou: + `valor`,
`aprovado_em`, `aprovado_por`, `motivo_rejeicao`. 036: `origem (admin|ia|os)`.
047: `enviado_em TIMESTAMPTZ`, `enviado_para TEXT` (rastreio do envio do PDF por
e-mail ao cliente). 060: `tipo (pecas|limpeza_reservatorio|dedetizacao|
limpeza_dedetizacao)` DEFAULT `'pecas'` — mesma tabela/timbrado, mas o PDF
ramifica pra um layout descritivo por cláusulas (Objeto/Escopo/Garantia) com
valores separados no final, em vez da tabela de itens (ver [orçamentos
avulsos](modulos/ordens-servico.md)). 061: `data_documento DATE` (nullable) —
data exibida no PDF, editável no admin; se vazio, usa `criado_em` como
sempre. `valor` (coluna original de 030, antes só usada na aprovação por O.S.)
passa a servir também de **override manual do total** do PDF de orçamento
avulso — quando preenchido, sobrepõe a soma de `orcamento_linhas`. 065:
`cliente_nome`, `cliente_documento` (CPF/CNPJ), `cliente_endereco`,
`cliente_email` — **cliente avulso (pessoa física)** não cadastrado: usados no
bloco "Cliente" do PDF quando `condominio_id` é NULL (senão prevalece o
condomínio). No PDF o rótulo do documento vira `CPF` (≤11 dígitos) ou `CNPJ`.
`garantia` (texto livre, 026): **vazio/NULL não é "sem garantia"** — criação e
PDF caem em "12 meses por defeito de fabricação". Orçamento sem garantia grava
o texto literal `Sem garantia` (caixa "Sem garantia" do editor, 05/10/2026) —
é **marca**, não texto de exibição: com ela o PDF e o painel do cliente tiram a
garantia do documento (inclusive os 90 dias da cláusula de dedetização).
**`orcamento_linhas`** (026, CASCADE) — `quantidade`, `valor_unitario`. 062:
`valor_unitario` vira nullable (era `NOT NULL DEFAULT 0`) — item sem preço
lançado fica `NULL` de verdade em vez de `0`, e o PDF omite a coluna de valor
pra esse item em vez de mostrar "R$ 0,00".
068: **`tipo_servico`** (`NULL` | `limpeza_reservatorio` | `dedetizacao`) — marca
a linha que representa um serviço nos orçamentos por cláusulas. O
`ficha_tecnica` **dessa** linha é o texto injetado na Cláusula Primeira do PDF;
antes o `orcamento-pdf.service` achava a linha por **regex na descrição**
(`/reservat[oó]rio/i`), então reescrever a descrição fazia a especificação
sumir do documento em silêncio. O regex segue no código como fallback para
linhas anteriores à migration; o backfill marcou as que ainda casavam com o
padrão. Linha de peça continua `NULL`.
074: **a resposta do cliente** — `cliente_comentario TEXT`, `respondido_em
TIMESTAMPTZ`, `respondido_por (FK usuarios, SET NULL)`. Três distinções que
custaram coluna própria em vez de reaproveitar o que já existia:

- `cliente_comentario` **não** é `motivo_rejeicao`. Vale para aprovação também
  — é comum aprovar com ressalva ("pode fazer, mas só na semana que vem") —,
  e `motivo_rejeicao` só faz sentido quando a resposta é não. O endpoint grava
  nos dois quando a resposta é recusa.
- `respondido_em` **não** é `aprovado_em`. `aprovado_em` só marca o sim; sem
  coluna própria, uma recusa não teria data nenhuma.
- `respondido_por` **não** é `aprovado_por`. Este é sempre o **cliente** que
  respondeu pelo painel; `aprovado_por` continua podendo ser alguém do
  escritório registrando por fora. Distinguir os dois é o ponto da migration —
  sem isso não dá para saber se o "aprovado" veio do cliente ou de quem
  digitou.

076: **quem assumiu a decisão** — `respondido_nome VARCHAR(120)`,
`respondido_cargo VARCHAR(60)`, `resposta_vista_em TIMESTAMPTZ`.

- ⚠️ `respondido_por` guarda o **id do usuário logado**, e isso responde "qual
  conta respondeu", não "quem decidiu". A conta é do CONDOMÍNIO: quem clica
  pode ser o síndico, o subsíndico ou quem estiver com o e-mail aberto naquele
  dia. Numa conversa seis meses depois — *"quem autorizou este serviço?"* — o
  id não resolve. Por isso nome e cargo são **digitados na hora**, na aprovação
  **e na recusa**. Mesma natureza do que contratos já faz com nome e documento.
- O cargo vem de **lista fechada** no front — Síndico, Gerente predial,
  Zelador, Administradora — com "Outro" abrindo campo livre.
  Texto livre puro viraria "sindico", "Síndico" e "SÍNDICO" — três grafias da
  mesma coisa e nenhum agrupamento possível. A coluna guarda o texto final.
- ⚠️ `resposta_vista_em` **nulo = ninguém do escritório abriu ainda**. Preenche
  quando alguém abre a ficha, por
  `POST /admin/orcamentos/avulsos/:id/resposta-vista`, que é idempotente: o
  `WHERE ... IS NULL` impede que reabrir reescreva a data da primeira vez.
  **Desde a 078 esta coluna não apaga mais o aviso** — ela informa quem abriu.

Índice parcial `idx_orcamentos_resposta_nao_vista (respondido_em DESC) WHERE
respondido_em IS NOT NULL AND resposta_vista_em IS NULL` — a consulta do aviso
roda a cada carregamento do painel, e o parcial mantém o índice do tamanho do
problema real (poucas linhas) em vez do tamanho da tabela.

077: **as respostas que já existiam nascem vistas.** Sem isso o deploy acenderia
o aviso para dezenas de respostas antigas, já tratadas por telefone na época —
e um aviso que nasce gritando sobre trabalho feito ensina a ignorar o aviso.
Marca com `respondido_em`, não `now()`: a data de "quando alguém viu" não pode
ser mais recente que quando de fato foi tratado.

078: **a baixa da resposta** — `resposta_tratada_em TIMESTAMPTZ`,
`resposta_tratada_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL`.

- ⚠️ **Ver e resolver eram a mesma coluna, e isso custava a informação.** Até
  26/08/2026 abrir a ficha marcava `resposta_vista_em` e o aviso sumia para
  sempre; um clique de passagem — ou uma tela que recarregasse antes de a
  pessoa ler qual era o orçamento — apagava o único sinal que existia. Os dois
  estados se separaram: `resposta_vista_em` = alguém **abriu** (automático),
  `resposta_tratada_em` = alguém **deu baixa** (ação explícita, e é o que
  apaga o aviso). A promessa que a tela do cliente faz é *"entramos em contato
  para agendar o serviço"* — quem fecha essa promessa é o telefonema.
- `resposta_tratada_por` é a **conta** que deu a baixa, e aqui isso basta: é
  gente do escritório, com login individual — ao contrário de
  `respondido_por`, que é a conta compartilhada do condomínio.
- **Responder de novo zera as duas** (`POST /cliente/orcamentos/:id/responder`):
  reaprovar um orçamento já tratado é trabalho novo e precisa gritar de novo.
- FK de autoria com `ON DELETE SET NULL` explícito — regra da 073.

O backfill segue a lição da 077: tudo que já tinha `resposta_vista_em` nasce
tratado, **na data em que foi visto**, com `resposta_tratada_por` nulo (ninguém
deu baixa de fato). Sem isso o aviso nasceria gritando sobre trabalho feito.

Índice parcial `idx_orcamentos_resposta_sem_baixa (respondido_em DESC) WHERE
respondido_em IS NOT NULL AND resposta_tratada_em IS NULL` — é a consulta do
aviso hoje. O da 076 continua servindo à distinção "ninguém abriu ainda"
dentro do próprio aviso.

Índice parcial `idx_orcamentos_condo_status (condominio_id, status) WHERE
condominio_id IS NOT NULL` — cobre a listagem da tela do cliente.

⚠️ **Pessoa física / orçamento avulso não entra neste fluxo**, por escopo: quem
não tem condomínio não tem login, e a resposta dele continua vindo por fora.

✅ **Aplicada em produção em 24/08/2026.**

090: **nota fiscal pelo Omie.** Fluxo em [nota-fiscal.md](modulos/nota-fiscal.md).

- `orcamento_linhas.natureza` (`servico` | `peca` | NULL, CHECK). NULL quer
  dizer que ninguém classificou ainda. A sugestão do modal **não** é gravada;
  grava-se o que quem emitiu confirmou. Não confundir com `tipo_servico`
  (068), que só marca as linhas de limpeza/dedetização que o PDF injeta em
  cláusula. Linha de peça e linha de conserto são ambas NULL ali.
- `orcamentos.nota_tipo` (`nfse` | `nfe`), `nota_status` (`processando` |
  `emitida` | `erro` | `cancelada`), `nota_numero`, `nota_url` (consulta
  pública), `nota_valor`, `nota_erro`, `nota_solicitada_em`,
  `nota_emitida_em`, `nota_emitida_por` (FK `usuarios`, **SET NULL**, regra
  de autoria da 073), `omie_os_codigo` (nCodOS). É uma nota por orçamento, e
  por isso as colunas moram na linha do orçamento.
  ⚠️ `processando` é estado real: a prefeitura processa o RPS depois do
  faturamento, e quem completa o número é o "Atualizar".
- `condominios.omie_cliente_codigo`: cache do código do cliente no Omie,
  preenchido na primeira emissão.

⏳ **Aplicada em teste em 17/11/2026. Falta produção** (rodar antes do push:
`GET /admin/orcamentos/avulsos` lê as colunas `nota_*`). Conferido em
18/11/2026 no `information_schema` de produção: nenhuma coluna da 090 lá.

091: **DANFE pelo Omie** (etapa 3). Fluxo em [nota-fiscal.md](modulos/nota-fiscal.md).

- `orcamento_linhas.omie_produto_codigo` (BIGINT): o produto do Omie
  escolhido para a linha de **peça**. NULL = ninguém escolheu. A NF-e só
  aceita produto cadastrado, e a linha é texto livre. Desde 20/11/2026
  (peças no orçamento, fase A) é gravado também **ao montar o orçamento**,
  pela busca do editor de itens, e não só no modal da nota; com a nota
  emitida ou processando, a rota da linha recusa trocar (409). Ver
  [pecas-no-orcamento.md](modulos/pecas-no-orcamento.md).
- `orcamentos.omie_pedido_codigo` (pedido de venda, o equivalente do
  `omie_os_codigo`) e `orcamentos.omie_nf_codigo` (`nIdNF` da NF-e gerada).
- **`omie_produtos`**: cópia local do catálogo do Omie (PK `codigo_produto`;
  `codigo`, `descricao`, `ncm` VARCHAR(20) porque há NCM com sufixo
  `8413.91.90.01`, `unidade`, `valor_unitario`, `inativo`), mais o uso real
  tirado dos pedidos faturados: `vezes_faturado`, `ultimo_cfop`,
  `ultimo_faturado_em`. Produto que some do Omie vira `inativo`, nunca é
  apagado (uma linha antiga pode apontar para ele).
- **`omie_produto_vinculos`** (PK `descricao_norm`; `codigo_produto`,
  `vezes`): a memória "esta descrição já foi este produto". Gravada só quando
  o Omie aceita o pedido.

⏳ **Aplicada em teste em 18/11/2026. Falta produção**, e roda **antes do
push** junto com a 090: a ficha do orçamento (`_carregar` da nota) lê
`omie_produto_codigo`, e a emissão de NFS-e também passa por ali.
> A tabela `orcamento_itens` (025) foi migrada e **removida** em 030.

### Equipamentos e etiqueta QR — migration 070

**`equipamentos`** — identidade permanente de bomba/motor/painel/quadro.
`id`, `codigo VARCHAR(12) UNIQUE` (o que vai no QR — base32 Crockford de 8
caracteres, **aleatório**: a URL da ficha não pode ser adivinhável, ela revela
endereço de cliente), `lote` (rótulo da folha impressa, ex. `L2608A`),
`condominio_id (SET NULL, nullable)`, `tipo`, `apelido`, `marca`, `modelo`,
`numero_serie`, `potencia_cv`, `tensao`, `local_instalacao`, `defeito_relatado`,
`observacoes`, `instalado_em`, `garantia_ate`, `status`, `ativo`, `criado_por`,
`criado_em`, `vinculado_em`, `atualizado_em`.
CHECK `status`: `etiqueta_livre | instalado | oficina | aguardando_orcamento |
aguardando_peca | em_conserto | pronto | devolvido | baixado`.
Índices: `idx_equip_condominio`, `idx_equip_status`, `idx_equip_lote`.

> `condominio_id` é nullable **de propósito**: a etiqueta nasce em branco e é
> colada na bomba antes de existir cadastro. O vínculo acontece no ato da
> retirada. Os quatro estados de bancada (`aguardando_*`, `em_conserto`) já
> estão no CHECK mas só ganham UI na Fase B. `devolvido` está no CHECK e não é
> usado — após a devolução o estado verdadeiro é `instalado`.
>
> `status` é **denormalizado** a partir da última movimentação (mesma escolha de
> `reservatorios.last_seen`): a listagem não precisa de `LATERAL`.

**`equipamento_movimentacoes`** — linha do tempo; é o que responde "essa bomba
já voltou 3 vezes". `equipamento_id (CASCADE)`, `tipo`, `status_novo`,
`chamado_id`/`os_id`/`orcamento_id`/`condominio_id` (todos SET NULL),
`usuario_id (SET NULL)`, **`usuario_nome`** (snapshot — histórico que perde o
autor quando o usuário é apagado não serve como histórico), `observacao`,
`criado_em`.
CHECK `tipo`: `cadastro | retirada | entrada_oficina | diagnostico |
orcamento_solicitado | orcamento_aprovado | em_conserto | aguardando_peca |
pronto | devolucao | anotacao | baixa`.
Índices: `idx_equip_mov_equip (equipamento_id, criado_em DESC)`,
`idx_equip_mov_chamado`, `idx_equip_mov_os`.

**`equipamento_fotos`** — `equipamento_id (CASCADE)`, `movimentacao_id (SET
NULL)`, **`dados_base64`** (data URL), `legenda`, `criado_por`, `criado_em`.
Imagem no banco, **não em disco**: o filesystem do Railway é efêmero e isso já
mordeu em `os_fotos` (migration 053). Servida por
`GET /equipamentos/:id/fotos/:fotoId/imagem`, que é **autenticada** — ao
contrário da rota equivalente de `os_fotos`, que é pública.

**Migration 071** — `orcamentos.origem` passa a aceitar `'bancada'` e a tabela
ganha `equipamento_id (SET NULL)`: o caminho de volta do orçamento para a bomba.
`SET NULL` e não `CASCADE` porque dar baixa num equipamento não pode apagar um
orçamento já enviado ao cliente. Índice `idx_orcamentos_equipamento`.

**Migration 072** — `ordens_servico.equipamento_id (SET NULL)` +
`idx_os_equipamento`: fecha o triângulo O.S. ↔ equipamento ↔ orçamento. Traz
também o `UPDATE` que acerta `orcamentos.origem = 'os'` para os orçamentos
nascidos de O.S. que ficaram com o DEFAULT `'admin'`.

> Quem **escreve** essa coluna: o modal de O.S. do admin (18/08) e o app do
> técnico (31/08, seção "Bomba atendida"), os dois pelo mesmo
> `PATCH /ordens-servico/:id`. Coluna sem escritor no app foi exatamente o
> estado dela entre as duas datas — a O.S. de campo nascia sempre com `NULL`.

`chamados` ganha `equipamento_id (SET NULL)` + `idx_chamados_equipamento` —
permite ver reincidência sem passar pela O.S.

**Migration 083** — `chamados.status` passa a aceitar **`cancelado`**, e a
tabela ganha `cancelado_em TIMESTAMPTZ` + `cancelado_motivo TEXT`.

⚠️ **`cancelado` NÃO é sinônimo de `fechado`, e a diferença é a razão da
migration existir.** `fechado` é o que alimenta `tempo_resolucao_seg`, a taxa
de resolução e o tempo médio do painel — ele afirma que o serviço foi prestado.
Até aqui o chamado aberto por engano, duplicado, ou cujo cliente desistiu só
tinha essa saída: cada engano entrava nas três contas como atendimento
cumprido. `cancelado` tira o chamado da fila **sem** escrever nenhuma das três.

⚠️ **`cancelado_em` é coluna própria, não reuso de `fechado_em`.** `fechado_em`
sai cru no CSV de `GET /relatorios/chamados` e é lido pelos KPIs como "quando o
serviço terminou". Escrever cancelamento nele faria a métrica mentir
exatamente onde esta migration existe para parar de mentir. Pelo mesmo motivo
`primeira_resposta_em` (TTFR) **não** é marcada ao cancelar: cancelar não é
responder.

⚠️ **O motivo é obrigatório na rota, não no banco.** `PATCH /chamados/:id`
recusa `status: "cancelado"` sem `motivo` (mín. 5 caracteres) — chamado que
some sem o porquê recria a ambiguidade que o `fechado` tinha. O `NOT NULL`
ficou de fora só porque a coluna nasce vazia nas linhas que já existiam.

⚠️ **Recriar o CHECK, não somar o valor** — o Postgres não tem "ADD VALUE" para
CHECK como tem para ENUM. `DROP` + `ADD` na mesma transação, igual à 081 de
`categoria`. O nome `chamados_status_check` é o gerado pelo CHECK inline da
migration 001, conferido contra `pg_constraint` antes de escrever a migration.

Reabrir um cancelado (`status: "aberto"`) **não limpa** `cancelado_em`/
`cancelado_motivo`: ficam como memória do último cancelamento, pela mesma
regra do `fechado_em` na reabertura.

**Migration 081** — `ordens_servico.sincronizada_em TIMESTAMPTZ` +
`idx_os_sincronizada_em` (parcial, `WHERE sincronizada_em IS NOT NULL`): quando
o servidor **recebeu** uma finalização que o app fez **sem sinal**.

`NULL` = finalizada com o servidor presente (o caminho normal). Preenchida = o
app mandou o próprio horário, e este valor é quando aquilo chegou.

⚠️ **Por que a coluna precisa existir.** A partir da 081 o `finalizada_em` pode
vir do **relógio do celular** — é isso que impede uma O.S. resolvida em 40
minutos no subsolo de aparecer como 3h40 só porque o sinal demorou. Mas relógio
de celular pode estar errado, e `ordens_servico` **não tem `atualizado_em`**:
sem esta coluna não sobraria nem um rastro indireto de que aquele horário não
veio do servidor. Ela é o que torna aceitável confiar no cliente.

⚠️ O `POST /:id/finalizar` faz **sanidade** no horário do app (recusa futuro
além de 5 min, mais velho que 7 dias, ou anterior à `chegada_em`) e cai para
`NOW()` quando descarta — **sem recusar o envio**, senão o trabalho do técnico
ficaria preso na fila do aparelho. `sincronizada_em` é marcada mesmo no
descarte, então a auditoria enxerga que veio do app.

⚠️ O mesmo instante fecha o **chamado**: `fechado_em` e `tempo_resolucao_seg`
usam o horário do serviço, não o da sincronização. Se usassem `NOW()`, as horas
sem sinal entrariam no SLA como tempo de atendimento.

**Migration 080** — `orcamentos.executado_em` + `executado_por (SET NULL)` +
`idx_orcamentos_executado` (parcial): o orçamento aprovado que **já foi
executado sem chamado nenhum** — o técnico já estava no prédio e resolveu na
hora, ou o orçamento é anterior à tela existir.
⚠️ **NÃO mexe em `status`**, que continua `aprovado`. "Executado" é fato do
atendimento, não estado do documento; um status novo obrigaria a revisar todo
`WHERE status = 'aprovado'` do sistema (admin, painel do cliente, PDF) para
descobrir quais deles ainda querem incluir os executados.

**Migration 079** — `chamados.orcamento_id (SET NULL)` +
`idx_chamados_orcamento` (parcial, `WHERE orcamento_id IS NOT NULL`): o
chamado sabe de qual orçamento aprovado ele saiu. `SET NULL` pela regra da
tabela de FKs abaixo — apagar o registro de negócio não pode apagar o
chamado, que é histórico de atendimento e pode ter O.S. e assinatura
penduradas nele. Índice parcial porque a esmagadora maioria dos chamados
não nasce de orçamento.

### Outras

**`planos_manutencao`** (032) — preventiva recorrente: `condominio_id (CASCADE)`,
`periodicidade_dias`, próxima data; job gera chamado P4 ao vencer.

**`contratos`** (035) — `condominio_id (CASCADE)`, `tipo (mensal|anual|avulso)`,
`valor_mensal`, `dia_vencimento (1-28)`. Índice único parcial de contrato ativo.
Assinatura eletrônica própria por link de e-mail (054/056/057/058): tokens
únicos (`assinatura_token_cliente/geral`), dados registrados na confirmação
(`assinatura_cliente/geral_nome/ip/em/img/doc`). 063 adiciona verificação por
código de 6 dígitos antes de assinar (`assinatura_cliente/geral_codigo` +
`_expira` + `_tentativas` + `_enviado_em`) e `assinatura_cliente/geral_protocolo`
(hash SHA-256 de contrato+papel+nome+doc+ip+timestamp, impresso no PDF como
evidência auditável independente do banco). Ver [docs/api.md](api.md#assinatura-de-contratos).
064: removido o `DEFAULT 'Ana Paula Martins Lima'` de `signatario_geral_nome`
(054) — todo contrato novo nascia com esse nome de pessoa pré-preenchido sem
ninguém ter escolhido isso; campo agora nasce vazio.

**`historico_chamados`** (033) — auditoria: `chamado_id (CASCADE)`,
`alterado_por`, mudança de status, reabertura.

⚠️ **`campo_alterado` NÃO é só nome de coluna.** Além dos campos de
`CAMPOS_AUDITADOS` (`chamado-historico.service.js`), a tabela guarda **eventos**,
com `valor_anterior`/`valor_novo` em texto livre: `criado` (abertura) e, desde
11/09/2026, **`devolvido`** — o técnico devolvendo o chamado à fila, com
`valor_novo` = o motivo e `valor_anterior` = o número da O.S. rascunho
descartada. Quem renderiza precisa tratar esses casos à parte, senão a linha sai
como "devolvido: OS-2026-0042 → não consegui acesso ao barrilete". Ver
[chamados-sla.md](modulos/chamados-sla.md). **Não exigiu migration.**

**`alerta_comentarios`** (004) — comentários na página /alertas.
`alerta_origem (telemetria|chamado)` + `alerta_id` (sem FK, cobre 2 origens),
`autor_id`, `texto`, `criado_em`. 019: `foto_url` + texto opcional (CHECK texto
OU foto).

**`sla_definicoes`** (023) — SLA por prioridade: `ttfr_min`, `ttr_min`. 028:
`sla_chegada_min` (P1-P4).

**`configuracoes`** (010) — key-value dinâmico (`chave`, `valor`,
`atualizado_em`, `atualizado_por`). Whitelist de chaves em
`src/services/config.service.js` (ver [`arquitetura.md`](arquitetura.md)). Cache em memória 30s.

---

### Agenda e cópia do faturamento do Omie — migration 092

Ver [agenda.md](modulos/agenda.md).

**`compromissos`** — o que se lança à mão na agenda.

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | SERIAL PK | |
| `titulo` | VARCHAR(160) | obrigatório |
| `tipo` | VARCHAR(20) | `reuniao`, `visita`, `pagamento`, `financeiro`, `outro` |
| `inicio` / `fim` | TIMESTAMPTZ | `fim` opcional; dia inteiro guarda 00:00 de SP |
| `dia_inteiro` | BOOLEAN | |
| `repeticao` | VARCHAR(10) | `nenhuma`, `semanal`, `mensal` (dia 29–31 cai no último dia do mês curto) |
| `repete_ate` | DATE | opcional |
| `condominio_id` | FK condominios, SET NULL | opcional |
| `responsavel_id` | FK usuarios, SET NULL | opcional |
| `descricao` | TEXT | |
| `so_admin` | BOOLEAN | `pagamento` e `financeiro` nascem `TRUE`; a rota esconde do gerente |
| `criado_por` | FK usuarios, SET NULL | |
| `criado_em` / `atualizado_em` / `apagado_em` | TIMESTAMPTZ | apagar é marcar |

**`omie_contratos`** — cópia de `servicos/contrato` `ListarContratos`:
`omie_codigo` (PK, nCodCtr), `numero` (cNumCtr), `omie_cliente`, `situacao`
(cCodSit, `10` = ativo), `valor_mensal`, `dia_faturamento`, `vigencia_inicio`,
`vigencia_fim`, `atualizado_em`.

**`omie_contrato_notas`** — NFS-e de contrato (`servicos/nfse` `ListarNFSEs`):
`omie_nfse` (PK, nCodNF), `omie_contrato` (OrdemServico.nCodigoContrato),
`numero_nfse`, `competencia` ('AAAA-MM' da emissão), `emitida_em`, `valor`,
`status` (cStatusNFSe; `C` = cancelada, ignorada no retrato).

**`omie_sincronizacoes`** — `nome` (PK, `faturamento_contratos`), `ultima_em`,
`ultimo_erro`, `detalhe` (JSONB com as contagens).

⚠️ As tabelas `omie_*` são **cópia**: quem manda é o Omie. Nada daqui
volta para lá. Desde a 096 a mesma sincronização copia também os clientes
(`omie_clientes`), e o `detalhe` traz `clientes` e `erro_clientes` (a falha dos
clientes não trava contratos e notas).

## Remoção de usuário — regra das FKs de autoria

`DELETE /admin/usuarios/:id` só funciona se **nenhuma** FK que aponta para
`usuarios(id)` estiver em `NO ACTION` (o padrão do Postgres quando se escreve
`REFERENCES usuarios(id)` sem cláusula `ON DELETE`). Era exatamente esse o bug
das migrations 023/026/030/032/035: o usuário que tinha criado um orçamento,
plano de manutenção ou contrato ficava impossível de remover, com erro `23503`
virando 500 na tela.

A **migration 073** converteu todas elas para `ON DELETE SET NULL` — o registro
sobrevive, só perde o autor. Padrão para colunas de autoria daqui pra frente:

| tipo de vínculo | cláusula | exemplos |
|---|---|---|
| sessão/credencial do próprio usuário | `ON DELETE CASCADE` | `login_codes`, `trusted_devices` |
| autoria / responsável em registro de negócio | `ON DELETE SET NULL` | `orcamentos.criado_por`, `contratos.criado_por`, `historico_chamados.alterado_por` |
| nenhuma cláusula (`NO ACTION`) | ❌ **não usar** | trava a remoção do usuário |

⚠️ **Ao criar coluna nova que referencia `usuarios(id)`, escreva a cláusula
`ON DELETE` explicitamente.** Se alguma escapar, o endpoint hoje responde 409
nomeando a tabela que segurou o vínculo (`src/routes/admin.routes.js`), em vez
do 500 mudo de antes — mas a FK continua precisando de conserto.

---

## Lixeira — `registros_apagados` (migration 089)

Toda linha apagada das tabelas de atendimento deixa uma cópia aqui, gravada
por trigger. Como a cópia é feita no banco, ela acontece em qualquer caminho:
rota, cascata de FK, script ou `psql` na mão.

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | BIGSERIAL | PK |
| `tabela` | VARCHAR(63) | `TG_TABLE_NAME` de onde a linha saiu |
| `registro_id` | TEXT | `id` da linha apagada (texto, para servir a qualquer tabela) |
| `dados` | JSONB | a linha inteira (`to_jsonb(OLD)`), incluindo foto base64 |
| `contexto` | TEXT | motivo, vindo de `current_setting('app.contexto', true)`; nulo se ninguém disse |
| `usuario_db` | TEXT | papel do Postgres que apagou |
| `apagado_em` | TIMESTAMPTZ | NOW() |

Trigger `trg_lixeira` (AFTER DELETE FOR EACH ROW → `fn_guardar_registro_apagado()`)
em: `ordens_servico`, `os_fotos`, `os_pecas`, `chamados`, `historico_chamados`,
`orcamentos`, `orcamento_linhas`, `condominios`, `reservatorios`, `contratos`,
`planos_manutencao`, `equipamentos`. **Ficam de fora**, de propósito:
`leituras`, `alertas`, GPS e `login_codes`, que os jobs de limpeza apagam em
volume todos os dias.

Para deixar o motivo ao apagar, dentro da transação:
`SELECT set_config('app.contexto', 'hard delete do condomínio 12 pelo usuário 8', true)`.
Hoje fazem isso o hard delete do condomínio e a devolução de chamado.

Para recuperar uma O.S. apagada:
```sql
SELECT dados FROM registros_apagados
 WHERE tabela = 'ordens_servico' AND dados->>'numero' = 'OS-2026-0123';
-- reinserir (mesmo id e número; testado em 11/11/2026):
INSERT INTO ordens_servico
SELECT (jsonb_populate_record(NULL::ordens_servico, dados)).*
  FROM registros_apagados
 WHERE tabela = 'ordens_servico' AND dados->>'numero' = 'OS-2026-0123';
```
Reinsira primeiro o pai (condomínio, chamado) e depois os filhos (`os_fotos`,
`os_pecas` pelo `os_id`).

⚠️ **Regra que veio junto:** o `DELETE /condominios/:id/hard` recusa (409) o
prédio que tem O.S. finalizada. Prédio com histórico se inativa, não se apaga.

## Scripts utilitários

- `migrations/limpar-dados-teste.sql` — DELETE explícito (preserva logins/config).
- `migrations/restaurar-defaults.sql` — reinsere SLAs P1-P4 + configs padrão.
- `scripts/migrate.js` — aplicador de migration via Node.
- `scripts/regenerar-pdfs-os.js`, `scripts/check-tecnicos.js` — manutenção.

### `planos_atribuicoes` (migration 082)

Quem faz cada preventiva **neste mês**. A atribuição do CICLO — a permanente e
por região continua sendo [`planos_zona_responsavel`](banco-de-dados.md).

| Coluna | Tipo | Nota |
|---|---|---|
| `plano_id` | INTEGER | FK `planos_manutencao`, ON DELETE CASCADE |
| `competencia` | DATE | **sempre o dia 1 do mês** — há CHECK |
| `tecnico_id` | INTEGER | FK `tecnicos`, ON DELETE CASCADE |
| `atribuido_em` | TIMESTAMPTZ | |
| `atribuido_por` | INTEGER | FK `usuarios`, ON DELETE SET NULL |

PK composta `(plano_id, competencia)`: **um responsável por plano por mês**.
Dois técnicos escalados para o mesmo prédio no mesmo ciclo é a viagem perdida
que a tela existe para evitar.

⚠️ **Por que competência e não um `tecnico_id` no plano.** A preventiva é mensal
e quem vai muda de mês para mês (férias, carga, um prédio que pede alguém).
Guardando no plano, a escala de setembro apagaria a de agosto e o histórico de
quem foi onde se perderia.

⚠️ **O CHECK do dia 1 não é decoração.** Sem ele "2026-09-01" e "2026-09-15"
seriam competências diferentes do mesmo mês, e a PK deixaria o mesmo plano ser
atribuído duas vezes.

### `planos_baixas_manuais` (migration 085)

A preventiva **dada como feita à mão** na tela do operador — o "Já foi feito"
de [Aprovados](modulos/painel-operador.md) trazido para a tela de Preventivas.
O caso real: a visita aconteceu e não passou pelo sistema.

| Coluna | Tipo | Nota |
|---|---|---|
| `plano_id` | INTEGER | FK `planos_manutencao`, ON DELETE CASCADE |
| `competencia` | DATE | **sempre o dia 1 do mês** — mesmo CHECK da 082 |
| `marcada_em` | TIMESTAMPTZ | carimbo, não digitação |
| `marcada_por` | INTEGER | FK `usuarios`, ON DELETE SET NULL |
| `proxima_em_anterior` | DATE | o ciclo do plano ANTES da baixa |
| `ultima_em_anterior` | DATE | idem |
| `ultima_os_id_anterior` | INTEGER | FK `ordens_servico`, ON DELETE SET NULL |
| `chamado_cancelado_id` | INTEGER | FK `chamados`, ON DELETE SET NULL |

PK composta `(plano_id, competencia)`: **uma baixa manual por plano por mês**.

⚠️ **Por que as datas anteriores moram aqui.** Marcar como feita ROLA o ciclo do
plano (`ultima_em`, `proxima_em`, `ultima_os_id`), como `executarPlano` e
`darBaixaPorOS` fazem — sem isso o job reabriria o chamado do mês na madrugada
seguinte e a preventiva marcada voltaria como "em campo". Rolar é destrutivo, e
a marcação é de **um clique sem confirmação**: o desfazer só devolve o plano ao
estado exato porque estas três colunas lembram qual era ele.

⚠️ **`chamado_cancelado_id` é a outra metade do desfazer.** A baixa cancela o
chamado P4 órfão do mês (senão ele fica no roteiro pedindo um serviço que já
aconteceu); guardar o id permite reabri-lo. Chamado **com técnico** não entra
nessa conta: ali o serviço está andando e a rota recusa com 409.

## 107 — guias: a regra pelo emissor (24/11/2026)

Fluxo em [guias-tributos.md](modulos/guias-tributos.md#conta-que-não-é-tributo-a-regra-pelo-emissor-24112026).
Na conta que não é tributo (boleto, água, luz, telefone), o destino no Omie
sai de quem cobra, não do tipo.

- **`guias_tributos.emissor_chave`** VARCHAR(60): `cnpj:<14>` |
  `arr:<segmento>:<empresa>` | `bol:<banco>:<agência>-<conta>`. NULL nos
  tributos (vale o tipo) e no boleto sem nada que identifique quem cobra.
  Índice parcial `guias_tributos_emissor_idx`. O que o leitor achou (nome,
  CNPJ, CNPJ mascarado) fica em `leitura.emissor`; de onde veio o fornecedor,
  em `leitura.destino` (`emissor`, `cnpj`, `cnpj_mascara`, `nome`, `tipo`).
- **`guias_emissores`** (`chave` PK, `nome`, `omie_fornecedor`,
  `omie_categoria`, `omie_conta`, `atualizado_por`, `atualizado_em`): o
  destino no Omie de cada emissor. Nasce vazia e é gravada pelo "Usar sempre
  que vier de..." da tela. Não substitui `guias_regras`: tributo continua
  pela regra do tipo.

✅ Teste e ✅ **produção** (24/11/2026, conferida no `information_schema`, antes do push).

## 104 — a página da nota: rascunho (23/11/2026)

Fluxo em [nota-fiscal.md](modulos/nota-fiscal.md), seção "A página da nota".

- **`orcamentos.nota_rascunho`** (JSONB, NULL = sem rascunho) — o rascunho da
  nota antes de emitir: `pagamento` ({ parcelas, vencimentos, banco, boleto }),
  `emails`, `info_adicional`, `impostos` (a última simulação do Omie, com a
  `assinatura` dos itens para a qual vale), `salvo_em`, `salvo_por`,
  `salvo_por_nome`. Gravado por merge (`||`), então salvar a cobrança não
  apaga a simulação. Não é apagado depois de emitida.

✅ **Aplicada em teste e em produção em 23/11/2026** (conferida no `information_schema`).

## 103 — o orçamento que vence: arquivado e lembrete (23/11/2026)

Fluxo em [orcamentos-vencimento.md](modulos/orcamentos-vencimento.md).

- **`orcamentos.arquivado_em`** (TIMESTAMPTZ) — o enviado que venceu sem
  resposta saiu da fila do escritório. NULL = não arquivado. ⚠️ **O status
  continua `enviado`**: tela do cliente, resposta pelo painel e relatórios
  leem status, e o cliente continua podendo aprovar um vencido. Validade nova
  (hoje ou futura, ou vazia) desarquiva. Índice parcial
  `idx_orcamentos_arquivado`.
- **`orcamentos.arquivado_por`** (FK `usuarios`, SET NULL) — NULL = o job.
- **`orcamento_lembretes`** — o lembrete "faltam N dias" ao cliente.

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | SERIAL | PK |
| `orcamento_id` | INTEGER | FK `orcamentos` **CASCADE** |
| `valido_ate` | DATE | a validade que o lembrete anunciou; `UNIQUE (orcamento_id, valido_ate)` |
| `dias` | INTEGER | quantos faltavam quando saiu |
| `destinatarios` | TEXT | cópia de `orcamentos.enviado_para` na hora |
| `status` | VARCHAR(12) | `enviando` → `enviado` · `erro` · `sem_email` |
| `erro`, `tentativas` | TEXT / INTEGER | erro é repetido até 3 tentativas |
| `email_id` | VARCHAR(80) | id do Resend |
| `criado_em`, `enviado_em` | TIMESTAMPTZ | |

O apagar do arquivado (`orcamento.apagar_dias`) não tem coluna: é `DELETE`
pelo job, e a cópia fica em `registros_apagados` (lixeira, 089) com o motivo
em `contexto`.

✅ **Aplicada em teste e em produção em 23/11/2026** (conferida no `information_schema`). Os 111 vencidos de produção foram arquivados no mesmo dia por `scripts/orcamentos-vencidos.js --prod --gravar`.

## 102 — o e-mail da nota e os avisos de cobrança (23/11/2026)

Fluxo em [cobranca-avisos.md](modulos/cobranca-avisos.md).

**`orcamentos.nota_emails`** (TEXT) — os destinatários que foram no bloco de
e-mail da nota (O.S. `cEnviarPara` / pedido `utilizar_emails`). Os avisos de
cobrança da nota usam a mesma lista.

**`omie_cliente_emails`** — para quem o Omie manda a nota de cada cliente:
`omie_cliente` PK, `emails` (separados por vírgula; NULL = nada no Omie),
`fonte` (`os`｜`pedido`｜`cadastro`), `referencia` (nCodOS/codigo_pedido),
`referencia_numero`, `referencia_data`, `lido_em`. ⚠️ Não é o e-mail do
cadastro do cliente: é o da nota mais recente dele (não cancelada). Lido de
novo depois de 12 h (modal) ou 7 dias (avisos).

**`omie_receber_avencer`** — cópia dos títulos do sistema "A VENCER" e "VENCE
HOJE" no Omie, as mesmas colunas de `omie_receber_atrasados` + `vence_hoje`
BOOLEAN. Trocada inteira a cada volta da sincronização.

**`cobranca_avisos`** — a fila e o histórico:

| Coluna | Tipo | O quê |
|---|---|---|
| `id` | SERIAL PK | |
| `omie_titulo` | BIGINT | `codigo_lancamento_omie` |
| `etapa` | VARCHAR(10) | `antes` · `dia` · `atraso1` · `atraso2` |
| `vencimento` | DATE | **`UNIQUE (omie_titulo, etapa, vencimento)`**: o mesmo aviso nunca vai duas vezes |
| `dias` | INTEGER | dias até o vencimento quando entrou (negativo = atraso) |
| `omie_cliente`, `origem`, `orcamento_id`, `valor`, `numero_nf` | | o título quando entrou |
| `destinatarios` | TEXT | para quem vai (editável só no aviso) |
| `status` | VARCHAR(12) | `pendente` → `enviando` → `enviado` · `erro`; `sem_email`; `expirado`; `ignorado` |
| `erro`, `email_id` | TEXT / VARCHAR(80) | a falha, ou o id do Resend |
| `criado_em`, `enviado_em` | TIMESTAMPTZ | |
| `enviado_por` | FK usuarios SET NULL | NULL no envio automático |
| `automatico` | BOOLEAN | |

✅ Teste e ✅ **produção** (conferida no `information_schema` em 23/11/2026, antes do push).

## 101 — o boleto sai junto com a nota do orçamento (23/11/2026)

Fluxo em [nota-fiscal.md](modulos/nota-fiscal.md), seção "Banco e boleto".

- `orcamentos.nota_conta_corrente` (BIGINT): a conta do Omie em que a nota
  cobra (`5960922842` Sicredi, `6109178168` Bradesco). NULL = nota de antes,
  que saía sempre no Bradesco.
- `orcamentos.boleto_status` (VARCHAR(20)): NULL = não pedido; `pendente` =
  pedido com a nota e ainda não gerado; `gerado`; `erro` (texto em
  `boleto_erro`). `boleto_atualizado_em` é a trava de 70 s entre pedidos.
- **`orcamento_boletos`** (PK `omie_titulo` = `codigo_lancamento_omie`;
  `orcamento_id` FK CASCADE, `parcela`, `vencimento`, `valor`,
  `conta_corrente`, `nosso_numero` = `cNumBancario`, `gerado`, `erro`,
  `gerado_em`, `atualizado_em`): uma linha por parcela.

✅ **Aplicada em teste e em produção em 23/11/2026**, antes do push (conferido
no `information_schema` de produção). `GET /admin/orcamentos/avulsos` e a nota
leem as colunas novas.

## 100 — guias de tributos → contas a pagar no Omie (23/11/2026)

Fluxo em [guias-tributos.md](modulos/guias-tributos.md). O PDF que o contador
publica no Onvio entra, o sistema lê a guia, alguém confere e "Lançar no
Omie" cria a conta a pagar.

**`guias_tributos`** — uma linha por guia lida (um PDF com duas guias = duas
linhas com o mesmo `arquivo_md5`).

| Coluna | Tipo | O quê |
|---|---|---|
| `id` | SERIAL PK | também compõe o código de integração no Omie: `GB-GUIA-<id>` |
| `tipo` | VARCHAR(14) | `das` · `darf` · `fgts` · `dae` · `gps` · `parcelamento` · `municipal` · `outro` |
| `descricao` | VARCHAR(120) | nome do tipo ("DAS · Simples Nacional") |
| `competencia` | VARCHAR(7) | 'AAAA-MM' (período de apuração) |
| `vencimento` | DATE | do texto do PDF (o código de arrecadação não traz) |
| `valor` | NUMERIC(12,2) | **do código de barras**; o servidor recusa valor diferente dele |
| `linha_digitavel` | VARCHAR(60) | só dígitos (48 arrecadação, 47 boleto) |
| `codigo_barras` | VARCHAR(44) | **único entre as guias não descartadas** (`guias_tributos_barras_uq`) |
| `numero_documento`, `cnpj` | VARCHAR | o que o PDF diz (CNPJ só dígitos) |
| `leitura` | JSONB | o que o leitor achou + `avisos` (zerados na conferência) |
| `arquivo_nome`, `arquivo`, `arquivo_md5` | VARCHAR / BYTEA / VARCHAR(32) | o PDF (dezenas de KB; limite de 4 MB na rota) |
| `omie_fornecedor`, `omie_categoria`, `omie_conta` | BIGINT / VARCHAR(20) / BIGINT | o destino no Omie |
| `status` | VARCHAR(12) | `conferir` → `enviando` → `lancada` · `erro` · `incerto`; `descartada` |
| `omie_codigo` | BIGINT | `codigo_lancamento_omie` da conta a pagar |
| `omie_erro` | TEXT | a recusa do Omie (ou a queda) |
| `anexo_ok`, `anexo_erro` | BOOLEAN / TEXT | o PDF anexado à conta a pagar |
| `enviado_em`, `enviado_por`, `criado_por`, `criado_em`, `atualizado_em` | | FKs de autoria `ON DELETE SET NULL` |

`incerto` = o Omie não respondeu à inclusão: a próxima tentativa consulta o
Omie pelo código de integração antes de incluir, e nunca cria duas.

**`guias_regras`** (`tipo` PK, `omie_fornecedor`, `omie_categoria`,
`omie_conta`, `atualizado_por`, `atualizado_em`) — o destino no Omie de cada
tipo. Semeada com o que o Omie mostrou em 23/11/2026: Receita Federal
`5993951792` e conta BRADESCO * `6109178168` em todas; DAS `2.06.99`, FGTS
`2.03.07`, parcelamento `2.06.98`, DAE/GPS `2.03.06`, municipal `2.06.97`
(fornecedor Prefeitura `5993972859`); DARF e "outro" sem categoria. Muda na
tela ("Usar sempre para...").

✅ Teste e ✅ **produção** (conferida no `information_schema` em 23/11/2026, antes do push).

## 099 — cobrança: os títulos em atraso do que o sistema emitiu (23/11/2026)

Integração com o Omie, fase 3 ([omie-integracao.md](modulos/omie-integracao.md#3-contas-a-receber-quem-pagou-quem-atrasou)).
⚠️ **Só os títulos de notas emitidas pelo sistema** (decisão do Pedro): o
título cuja `nCodOS` é a `orcamentos.omie_os_codigo` ou a
`omie_faturamento_itens.omie_os`, cuja `nCodPedido` é a
`orcamentos.omie_pedido_codigo`, ou o `titulo_omie` do lote. A herança sem
baixa no Omie (190 atrasados, R$ 268,7 mil em 23/11/2026) não entra.

**`omie_receber_atrasados`** — cópia dos títulos `ATRASADO` no Omie que o
sistema emitiu, **trocada inteira** a cada volta da sincronização de hora em
hora (título baixado no Omie some sozinho).

| Coluna | Tipo | O quê |
|---|---|---|
| `omie_codigo` | BIGINT PK | `codigo_lancamento_omie` |
| `omie_cliente` | BIGINT | `codigo_cliente_fornecedor` (→ `omie_clientes`) |
| `origem` | VARCHAR(10) | `orcamento` · `contrato` |
| `orcamento_id` / `omie_contrato` / `competencia` | INTEGER / BIGINT / VARCHAR(7) | de onde veio (sem FK: a cópia é refeita) |
| `documento`, `parcela`, `numero_nf` | VARCHAR | `numero_documento`, `numero_parcela`, `numero_documento_fiscal` |
| `valor` | NUMERIC(12,2) | `valor_documento` |
| `emissao` / `vencimento` | DATE | |
| `conta_corrente` | BIGINT | `id_conta_corrente` (Sicredi `5960922842`, Bradesco `6109178168`) |
| `boleto_numero` | VARCHAR(40) | o nosso número; NULL = sem boleto gerado |

**`omie_boleto_links`** (`omie_titulo` PK, `link`, `lido_em`) — o link do PDF
do boleto, lido no `ObterBoleto` só quando alguém pede. À parte porque a cópia
acima é trocada inteira.

**`omie_receber_pagos`** (`omie_titulo` PK, `pago_em` DATE, `observacao`,
`marcado_por` FK usuarios SET NULL, `marcado_em`) — o "já pagou" marcado à
mão. **Vale só no sistema** (a baixa não vai ao Omie, decisão de 20/11/2026);
a sincronização nunca mexe nesta tabela.

**`omie_clientes`** ganha `telefone`, `telefone2` (montados de ddd + número
do Omie: "(11) 9999-0000") e `contato`.

✅ Teste e ✅ **produção (23/11/2026)**, antes do push (conferida no
`information_schema` antes e depois). Ela precisa vir antes do código: a
sincronização de hora em hora grava `omie_clientes.telefone`, e sem a coluna
a cópia inteira (contratos junto) falha.

## 098 — o escritório e o turno pelo chamado (20/11/2026)

Duas marcas em `chamados`, uma em cada direção
([painel-operador.md](modulos/painel-operador.md#o-escritório-e-o-turno-20112026-migration-098)).

| Coluna | Tipo | O que é |
|---|---|---|
| `escritorio_motivo` / `escritorio_por` / `escritorio_em` | VARCHAR(300) / FK usuarios (SET NULL) / TIMESTAMPTZ | "Pedido do escritório": o admin marca o chamado para o turno. Selo no painel do turno; não muda a ordem da fila |
| `pede_escritorio_motivo` / `pede_escritorio_por` / `pede_escritorio_em` | idem | "Precisa do escritório": o turno marca; entra no "Precisa de você" do Hoje até alguém dar como atendido |

Índice parcial `chamados_pede_escritorio_idx` em `pede_escritorio_em`.
Marcar e desmarcar gravam em `historico_chamados` (`campo_alterado` =
`pedido_escritorio` / `precisa_escritorio`, o motivo no `valor_novo`; ao
desmarcar, no `valor_anterior`). ✅ Teste e ✅ produção (20/11/2026).

## 097 — o lote do faturamento dos contratos (20/11/2026)

Integração com o Omie, fase 2 ([omie-integracao.md](modulos/omie-integracao.md)).

**`omie_faturamento_itens`** — **uma linha por (competência, contrato)**
(`UNIQUE`), que é o que impede faturar o mesmo contrato duas vezes no mês. A
linha nasce quando o Pedro tira o contrato do lote ou quando o envio começa;
quem só "entra" no lote não tem linha.

| Coluna | Tipo | O quê |
|---|---|---|
| `competencia` | VARCHAR(7) | `AAAA-MM` |
| `omie_contrato` | BIGINT | `omie_contratos.omie_codigo` (sem FK: a cópia é refeita) |
| `status` | VARCHAR(10) | `tirado` · `enviando` · `faturado` · `erro` (o Omie recusou; pode ir de novo) · `incerto` (caiu sem resposta; não vai de novo sozinho) |
| `valor` / `conta_corrente` | NUMERIC / BIGINT | o que foi enviado |
| `omie_os` | BIGINT | `nCodOS` devolvido pelo `FaturarContrato` |
| `omie_status` / `omie_mensagem` | VARCHAR(40) / TEXT | `cCodStatus` ou o faultcode, e a mensagem |
| `nfse_numero` | VARCHAR(30) | volta pela sincronização (nota com a mesma OS) |
| `titulo_omie`, `titulo_vencimento`, `titulo_valor`, `titulo_status` | | a conta a receber, pela nota |
| `boleto_numero` / `boleto_bancario` | VARCHAR(30) | `cNumBoleto` / `cNumBancario` (o nosso número) |
| `boleto_gerado` | BOOLEAN | o título tem boleto (`boleto.cGerado = S`); `FALSE` = o painel avisa "sem boleto" |
| `boleto_pedido_em` | TIMESTAMPTZ | quando o sistema pediu o `GerarBoleto`; trava o pedido em dobro por 10 min sem resposta |
| `por_usuario` | FK usuarios, SET NULL | quem confirmou ou tirou |
| `enviado_em` | TIMESTAMPTZ | |

E duas colunas na cópia: **`omie_contratos.conta_corrente`** (`infAdic.nCodCC`,
a conta em que o contrato cobra; o lote só leva Sicredi `5960922842` e
Bradesco `6109178168`) e **`omie_contrato_notas.omie_os`**
(`OrdemServico.nCodigoOS`, indexada: é por ela que a nota volta ao item).

## 096 — clientes do Omie e o elo do contrato com o prédio (20/11/2026)

Integração com o Omie, fase 1 ([omie-integracao.md](modulos/omie-integracao.md)).

**`omie_clientes`** — cópia de `geral/clientes` `ListarClientes`, refeita pelo
mesmo job do faturamento:

| Coluna | Tipo | O quê |
|---|---|---|
| `omie_codigo` | BIGINT PK | `codigo_cliente_omie` (= `omie_contratos.omie_cliente`) |
| `documento` | VARCHAR(14) | CNPJ/CPF **só dígitos**, indexado: é por ele que o contrato acha o prédio |
| `razao_social` / `nome_fantasia` / `email` / `cidade` | TEXT | |
| `inativo` | BOOLEAN | `inativo = 'S'` no Omie |
| `atualizado_em` | TIMESTAMPTZ | |

**`omie_cliente_vinculos`** — o elo feito **à mão** (cliente cujo CNPJ não bate
com nenhum prédio, ou bate com mais de um):

| Coluna | Tipo | O quê |
|---|---|---|
| `omie_cliente` | BIGINT PK | sem FK (a cópia dos clientes é refeita) |
| `condominio_id` | FK condominios, CASCADE | |
| `ligado_por` | FK usuarios, SET NULL | |
| `ligado_em` | TIMESTAMPTZ | |

⚠️ **De qual prédio é o contrato**, nesta ordem: o elo à mão; o CNPJ do cliente
igual ao `condominios.cnpj` (os dois só em dígitos) quando bate com **um**
prédio; senão nenhum, com o motivo. A sincronização nunca mexe nos vínculos;
apagar a linha volta ao automático. Nada é gravado no Omie.

## 095 — `condominio_notas`: notas e avisos do prédio (20/11/2026)

| Coluna | Tipo | O quê |
|---|---|---|
| `id` | SERIAL PK | |
| `condominio_id` | INTEGER NOT NULL → `condominios(id)` ON DELETE CASCADE | |
| `tipo` | VARCHAR(10) NOT NULL DEFAULT `nota`, CHECK `nota` \| `aviso` | nota livre do escritório ou aviso mandado ao síndico |
| `texto` | TEXT NOT NULL | a nota, ou a mensagem do aviso |
| `assunto` | VARCHAR(200) | só no aviso |
| `enviado_para` | TEXT | só no aviso: os e-mails do cadastro que receberam |
| `autor_id` | INTEGER → `usuarios(id)` ON DELETE SET NULL | quem escreveu ou mandou |
| `criado_em` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

Índice `(condominio_id, criado_em DESC)`. Nota: o escritório inteiro
escreve; apaga o autor ou a gestão. Aviso não se apaga (registro do que foi
dito ao cliente). Aparecem no histórico da página do prédio. Fluxo em
[redesenho-admin.md](modulos/redesenho-admin.md). ✅ Teste (20/11/2026).
⏳ **Falta produção** (antes do push, depois de 090–094).

## 094 — peças da O.S.: usadas e a orçar (20/11/2026)

- `os_pecas.situacao` VARCHAR(10), CHECK `usada` | `a_orcar` | NULL. NULL = não se
  sabe (as registradas antes; ninguém adivinha pelo texto).
- `orcamento_linhas.os_peca_id` INTEGER → `os_pecas(id)` ON DELETE SET NULL, com
  índice parcial. A origem da linha e a **trava** contra cobrar a mesma peça
  duas vezes (a rota recusa a peça que já está em orçamento não recusado).
- `orcamento_linhas.peca_usada` BOOLEAN NOT NULL DEFAULT false. A linha é de peça
  usada na visita: o PDF do orçamento a põe no bloco "Peças utilizadas na
  visita". Copiada da peça ao trazer, editável.

Fluxo em [pecas-no-orcamento.md](modulos/pecas-no-orcamento.md). ✅ Teste
(20/11/2026). ✅ **Produção** (conferida no `information_schema` em 23/11/2026: `peca_usada`, `os_peca_id`, `os_pecas.situacao`).

## 093 — `compromissos.chamado_id` (19/11/2026)

`ALTER TABLE compromissos ADD COLUMN chamado_id INTEGER REFERENCES
chamados(id) ON DELETE SET NULL` + índice parcial. A visita marcada no quadro
de despacho da Agenda sabe de que chamado é (ver
[redesenho-admin.md](modulos/redesenho-admin.md), etapa 4). Nula nos
compromissos antigos. ✅ Teste (19/11/2026). ✅ **Produção** (conferida no `information_schema` em 23/11/2026).
