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
variáveis `PG*` separadas. Pool: `max=20` (env `PG_POOL_MAX`), idle 30s,
connection timeout 5s.

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
`email` (045 `VARCHAR(255)` → 047 `TEXT`): um ou mais e-mails separados por
vírgula, usados como destinatário no envio de orçamentos.

**`reservatorios`** — 1:N com condomínio. Calibração da sonda fica aqui.
`id`, `condominio_id (FK CASCADE)`, `nome`, `tipo`, `device_id UNIQUE`,
`device_key`, `ativo`, `last_seen`, `altura_total_m`, `adc_zero`,
`adc_por_metro`, `faixa_sonda_m`, `limiar_bomba`.
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
(aberto|em_atendimento|fechado)`, `prioridade`, `titulo`, `descricao`,
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
- O cargo vem de **lista fechada** no front (Síndico, Subsíndico, Conselheiro,
  Zelador, Administradora, Gerente predial) com "Outro" abrindo campo livre.
  Texto livre puro viraria "sindico", "Síndico" e "SÍNDICO" — três grafias da
  mesma coisa e nenhum agrupamento possível. A coluna guarda o texto final.
- ⚠️ `resposta_vista_em` **nulo = ninguém do escritório abriu ainda**. É o que
  faz a resposta virar aviso no painel **sem inventar linha em `alertas`** —
  aquela tabela é amarrada a `device_id`, existe para telemetria, e um
  orçamento não tem sensor. Preenche quando alguém abre a ficha, por
  `POST /admin/orcamentos/avulsos/:id/resposta-vista`, que é idempotente: o
  `WHERE ... IS NULL` impede que reabrir reescreva a data da primeira vez.

Índice parcial `idx_orcamentos_resposta_nao_vista (respondido_em DESC) WHERE
respondido_em IS NOT NULL AND resposta_vista_em IS NULL` — a consulta do aviso
roda a cada carregamento do painel, e o parcial mantém o índice do tamanho do
problema real (poucas linhas) em vez do tamanho da tabela.

077: **as respostas que já existiam nascem vistas.** Sem isso o deploy acenderia
o aviso para dezenas de respostas antigas, já tratadas por telefone na época —
e um aviso que nasce gritando sobre trabalho feito ensina a ignorar o aviso.
Marca com `respondido_em`, não `now()`: a data de "quando alguém viu" não pode
ser mais recente que quando de fato foi tratado.

Índice parcial `idx_orcamentos_condo_status (condominio_id, status) WHERE
condominio_id IS NOT NULL` — cobre a listagem da tela do cliente.

⚠️ **Pessoa física / orçamento avulso não entra neste fluxo**, por escopo: quem
não tem condomínio não tem login, e a resposta dele continua vindo por fora.

✅ **Aplicada em produção em 24/08/2026.**
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

`chamados` ganha `equipamento_id (SET NULL)` + `idx_chamados_equipamento` —
permite ver reincidência sem passar pela O.S.

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

## Scripts utilitários

- `migrations/limpar-dados-teste.sql` — DELETE explícito (preserva logins/config).
- `migrations/restaurar-defaults.sql` — reinsere SLAs P1-P4 + configs padrão.
- `scripts/migrate.js` — aplicador de migration via Node.
- `scripts/regenerar-pdfs-os.js`, `scripts/check-tecnicos.js` — manutenção.
