---
tags:
  - projeto
  - fluxo
aliases:
  - Equipamentos
  - Etiqueta QR
  - Bancada
  - Oficina
---
# Fluxo: Equipamentos e etiqueta QR

Identidade permanente de bomba, motor, painel e quadro — e a etiqueta QR que
abre a ficha desse equipamento no celular.

## O problema que originou o módulo

Na oficina se acumulam bombas retiradas de condomínios para conserto. Sem
identidade, ninguém sabe de qual prédio veio nem qual era o defeito relatado —
a informação vivia na memória de quem foi buscar. Até aqui só `reservatorios`
tinha identidade no sistema; bomba aparecia apenas como texto solto em
`os_pecas` ("trocou bomba X"), sem vínculo com um objeto físico.

## Decisões estruturais

**A etiqueta é do equipamento, não da passagem pela oficina.** A mesma bomba
volta várias vezes, e é justamente o histórico das vezes anteriores que se
perde hoje. Etiqueta por ocorrência jogaria fora o ativo do módulo.

**A etiqueta nasce em branco.** A bomba chega na oficina antes de existir
cadastro — se o cadastro tivesse que vir primeiro, ninguém usaria. O lote de
etiquetas é impresso e fica na van; o vínculo com o condomínio acontece no ato
da retirada, com a bomba na mão.

**Sem plugin de scanner no app.** O QR aponta para uma URL e a câmera nativa do
Android já a abre. Um plugin de leitura mexeria no build Android, que está
sob o prazo da Play Store (roadmap 7J). Scanner dentro do app é Fase D.

**Código aleatório, não sequencial.** A ficha revela endereço e histórico de
cliente; uma URL adivinhável (`/e/1`, `/e/2`) exporia o parque inteiro a quem
tem um navegador. São 8 caracteres do alfabeto Crockford base32 (sem I, L, O e
U, que se confundem na digitação) — 32⁸ ≈ 1,1 trilhão de combinações.

## Ciclo (Fase A)

1. **Gerar lote** — `POST /equipamentos/lote` cria N etiquetas
   `status = 'etiqueta_livre'`, agrupadas por um rótulo de lote (`L2608A`).
2. **Imprimir** — `GET /equipamentos/etiquetas.pdf?lote=…` devolve a folha A4.
3. **Colar e vincular** — o técnico escaneia, cai em `/e/:codigo`, escolhe o
   condomínio, descreve o defeito e decide o destino:
   - **Registrar retirada** → `status = 'oficina'`, movimentação `retirada`;
   - **Só cadastrar** → `status = 'instalado'`, movimentação `cadastro`.
4. **Ficha** — qualquer pessoa da equipe que escanear vê condomínio, endereço,
   defeito relatado, fotos, dados técnicos e a linha do tempo completa.
5. **Registrar** — botões conforme o estado: pronta → devolver → instalado.
   Anotação é nota livre e **não** muda o status.

O painel da bancada (o que está parado e há quantos dias, em lista) continua
na **Fase 12B-2** — ver [roadmap](../../memory-bank/roadmap.md).

## Orçamento da bancada (migration 071)

Liga o módulo ao sistema de orçamentos que já existia. **Nenhuma tabela nova**:
o orçamento da bancada é um `orcamentos` comum, com as peças como
`orcamento_linhas`. Criar um cadastro de peças paralelo repetiria o erro que a
migration 030 levou meses para desfazer.

1. Na ficha, com a bomba na oficina: **Outras ações → Solicitar orçamento**.
   O técnico lista as peças e a quantidade — **não o preço**. Quem está na
   bancada sabe qual peça falta; quem precifica é o comercial.
2. `POST /equipamentos/:id/orcamento` cria, numa transação: o orçamento
   (`origem = 'bancada'`, `equipamento_id`, status `rascunho`, número
   `OR-XXXXXX` da mesma sequence), as linhas, a movimentação
   `orcamento_solicitado` apontando o orçamento, e o status
   `aguardando_orcamento`. Meio caminho aqui deixaria a bomba esperando um
   orçamento que não existe.
3. A **constatação já nasce identificando o equipamento** (apelido, marca,
   modelo, série) — quem lê o PDF do outro lado não tem a etiqueta na mão.
4. O orçamento aparece na aba **Orçamentos › "Solicitados pelos técnicos"**,
   com o selo **OFICINA** e o código da etiqueta — foi um técnico que pediu,
   ainda que sem O.S. por trás. Clicar na linha abre o modal do orçamento
   avulso, que é onde ele de fato vive: o painel de detalhe daquela aba é
   montado sobre campos de O.S. que aqui não existem.
   - ⚠️ A aba é alimentada por **duas consultas concatenadas em JS**, não por
     um UNION: as 28 colunas do SELECT de O.S. teriam de ser espelhadas com
     `NULL`s, e todo campo novo passaria a exigir manutenção nos dois lados.
     A linha traz `fonte` (`os` | `bancada`) para o front saber o que abrir.
5. **Aprovar ou recusar no painel move a bomba na bancada**
   (`equipamento-bancada.service.js`, chamado pelo `PATCH
   /admin/orcamentos/avulsos/:id`): aprovado → `em_conserto`; recusado →
   volta para `oficina` (a bomba segue parada, mas agora aguardando a decisão
   de devolver sem conserto, não a resposta do cliente).

### Um conserto, um orçamento

A mesma bomba pode ser pedida por dois caminhos ao mesmo tempo: o técnico marca
"precisa de orçamento" na O.S. em campo **e** pede de novo pela etiqueta, na
bancada. Sem tratamento nasciam dois orçamentos abertos para o mesmo serviço,
os dois aprováveis, cada um gerando sua movimentação. As duas pontas se
protegem:

- **`POST /equipamentos/:id/orcamento`** (ficha), na ordem:
  1. Já existe orçamento **aberto** (`rascunho`/`enviado`) apontando esta bomba?
     As peças entram **nele**, e a resposta traz `reaproveitado: true`.
  2. Existe **O.S. desta bomba** com `orcamento_necessario` e ainda sem
     orçamento? O pedido nasce **vinculado a ela** (`os_id`, `origem = 'os'`).
  3. Nenhum dos dois: nasce como `origem = 'bancada'`, solto.
- **`_garantirOrcamentoDaOs`** (admin) faz o espelho: se a O.S. tem equipamento
  e existe orçamento aberto **da bancada** para ele (`os_id IS NULL`), a O.S.
  **adota** esse orçamento em vez de abrir um segundo.
- A listagem da bancada na aba filtra `os_id IS NULL` — adotado, ele aparece
  pela linha da O.S., não duas vezes.

- ⚠️ **O reflexo nunca derruba a atualização do orçamento.** O documento
  comercial é a fonte da verdade e o estado do equipamento é consequência: erro
  ali é logado, não lançado.
- ⚠️ **Bomba já devolvida ou baixada não volta para a bancada** porque um
  orçamento antigo mudou de status.
- `valor_unitario` fica `NULL` de verdade quando o técnico não lança preço
  (migration 062) — o PDF omite a coluna de valor desse item em vez de mostrar
  "R$ 0,00".

## Estados

`etiqueta_livre` → `instalado` ⇄ `oficina` → `pronto` → `instalado`, com
`baixado` como saída final. `aguardando_orcamento`, `aguardando_peca` e
`em_conserto` já existem no CHECK da migration 070 mas só ganham UI na Fase B —
estão ali para a fase seguinte não precisar de migration só para soltar
constraint.

> `devolvido` está no CHECK e **não é usado**: após a devolução o estado
> verdadeiro é `instalado` ("está no prédio funcionando"), que é o que a
> bancada precisa ver para parar de contar a bomba como pendência.

## Quem enxerga

Guard `equipeInterna` (`src/middleware/equipeInterna.js`) — admin, gerente e
**técnico**. Não é um degrau da escada de privilégio: ele **cruza** `adminOnly`,
alcançando o técnico (que não passa lá) e deixando o `operador` de fora. Existe
porque quem escaneia na bancada é o técnico. `cliente` não entra em nenhuma rota
do módulo: a ficha mostra dados de um condomínio que pode não ser o dele.

> O `operador` estava aqui até 27/08/2026 e saiu junto com a restrição real do
> perfil: a seção Equipamentos sempre foi escondida dele no menu, então
> `equipeInterna` era o último caminho por onde ele ainda alcançava a oficina
> pela API.

`GET /equipamentos/condominios` existe pelo mesmo motivo — `GET /condominios` é
`adminOnly`, mas é o técnico quem aponta de qual prédio a bomba saiu. Devolve
só `id` e `nome`, nunca endereço, contato ou CNPJ.

## Etiqueta impressa

`src/services/etiquetas-pdf.service.js`, Puppeteer com browser singleton (mesmo
padrão de `orcamento-pdf.service.js`). O PDF sai em memória e vai direto na
resposta — não persiste em disco, que é efêmero no Railway.

**Desenho da etiqueta** (2026-08-18): a marca em três faixas — cabeça marinho
(`#0d2775`) com o wordmark branco e o **chanfro de 45°** cortando o canto
inferior direito, campo branco com o QR e o código sublinhado pelo fio amarelo
(`#fbb329`), e o pé com a propriedade. O logo é `public/login-logo.png`
(wordmark branco + engrenagens, fundo transparente), lido uma vez e injetado
como data URI numa **classe CSS** — repetir a imagem em cada célula inflaria o
HTML em ~1,3 MB por folha.

- ⚠️ **O QR fica sempre preto sobre branco.** Invertido (claro sobre escuro)
  muitos leitores de celular não pegam, e etiqueta que não escaneia é papel
  colado à toa numa bomba. Por isso a cor da marca vive na cabeça e no fio, não
  no campo do código.
- **Correção de erro `H`** (~30% do código recuperável): etiqueta de casa de
  máquinas vive com graxa, respingo e sol. O código humano impresso ao lado é o
  plano B quando nem isso resolve.
- **Dois formatos**: `corte` (padrão — papel comum com marcas de corte) e
  `pimaco6180` (folha adesiva pré-cortada de 10, 84,7 × 50,8 mm, onde a margem
  precisa bater com a picotagem e a borda tracejada é omitida).
- ⚠️ **`PUBLIC_BASE_URL`**: sem essa env o serviço deriva a URL do request e
  recusa gerar o PDF se o host for local (`&forcar=1` ignora, só para teste).
  Etiqueta é física e permanente — um QR apontando para `localhost` vira lixo
  colado numa bomba que ninguém vai reetiquetar.
- ⚠️ **Material**: papel comum descola em casa de máquinas (umidade, graxa,
  calor). Poliéster/vinil adesivo, ou papel adesivo com fita transparente larga
  por cima.

## O.S. ↔ equipamento ↔ orçamento (migration 072)

O triângulo fechado. `chamados` e `orcamentos` já apontavam para
`equipamentos`; faltava a **O.S.**, que é onde o técnico registra a retirada da
bomba no campo.

- `ordens_servico.equipamento_id` (SET NULL — dar baixa numa bomba não pode
  apagar a O.S., que é documento assinado pelo cliente).
- O seletor fica em **dois lugares**, e os dois gravam o mesmo campo pelo mesmo
  `PATCH /ordens-servico/:id`:
  - **modal de O.S. do admin**, seção "Equipamento";
  - **app do técnico** (31/08/2026), seção **"Bomba atendida"** — quem escreve
    a O.S. de campo é ele, e até essa data o campo só existia para quem não
    estava na casa de máquinas. Ver
    [`app-mobile.md`](app-mobile.md).
  Os dois listam os equipamentos etiquetados daquele condomínio
  (`GET /equipamentos?condominio_id=`, que passa em `equipeInterna` — é por
  isso que o técnico alcança essa rota sem passar em `adminOnly`).
- **`_garantirOrcamentoDaOs` propaga o `equipamento_id`** para o orçamento.
  A partir daí, aprovar o orçamento de uma O.S. de conserto move a bomba para
  `em_conserto` pelo mesmo `equipamento-bancada.service.js` — os dois caminhos
  (bancada e O.S.) chegam no mesmo lugar.
- A ficha lista as O.S. do equipamento: as vinculadas pela coluna **e** as que
  aparecem nas movimentações, para não perder o que foi registrado antes da
  coluna existir.

- ⚠️ **O seletor sempre inclui o equipamento já vinculado**, mesmo que ele não
  seja daquele condomínio (bomba trocada de prédio, dado antigo) **ou que ele
  esteja inativo** — a listagem filtra `ativo = true`, então os dois casos
  somem dela. Sem esse resgate o `<select>` não acha o valor, cai em "nenhum",
  e **salvar a O.S. apagaria o vínculo em silêncio**. O defeito apareceu no
  primeiro teste do admin, e vale igual no app: quem escrever um terceiro
  seletor precisa repetir o resgate.
- ⚠️ Campo novo no detalhe da O.S. precisa entrar no **SELECT explícito** de
  `GET /ordens-servico/:id`: ele lista coluna por coluna (o `os.*` foi trocado
  de propósito, para não arrastar a assinatura base64 de ~120 KB em toda
  abertura).

**Correção adjacente da 072:** orçamento criado a partir de uma O.S. nascia com
`origem = 'admin'` — o DEFAULT da coluna —, porque `_garantirOrcamentoDaOs`
nunca setava o campo. O backfill da migration 036 acertou os antigos e os novos
voltavam a errar desde então. Código corrigido e `UPDATE` de acerto na 072.

## Ficha (`/e/:codigo`)

`public/equipamento.html` + `equipamento.css` + `equipamento.js`.

**Segue o padrão da tela de assinatura de contrato** (`_shell` em
`src/routes/assinatura.routes.js`), por decisão do Pedro em 2026-08-18: cartão
único centrado de 520px sobre fundo escuro com halo, fio âmbar→azul no topo,
logo centralizada, pares rótulo/valor em `table.info`, botão âmbar de largura
total e rodapé fora do cartão.

⚠️ Por isso **não carrega `admin.css`** — a tela de assinatura também não
carrega, e tem paleta própria. A folha duplica essa paleta de propósito, mesma
situação de `landing.css` e `login.css` entre si: são páginas servidas
separadamente. **Mudou a paleta de uma, mude na outra.** Ganho colateral: a
ficha deixou de baixar 265 KB de CSS do painel numa tela aberta pelo celular,
na casa de máquinas, muitas vezes em rede ruim.

**Direção: "próxima ação única"** (2026-08-18). A tela responde *o que aconteceu
com essa bomba agora* e oferece **uma** ação, escolhida pelo estado; as demais
ficam recolhidas em "Outras ações". A primeira versão era quatro caixas de peso
igual (Registrar / Fotos / Dados / Histórico) — o layout que qualquer CRUD
produz. O contrato da direção está no topo de `equipamento.html`, como comentário
HTML; estratégia em `.impeccable/surfaces/public-equipamento-html.md`.

- **Um cartão só, seções separadas por `hr.divider`.** Nada de caixa dentro de
  caixa: a hierarquia vem da ordem e do peso tipográfico, não de molduras.
  Repor cards ali devolve o problema original.
- **O trilho do ciclo** (No prédio → Oficina → Pronta → Devolvida) é conteúdo,
  não enfeite: a posição sai das movimentações. É o único momento de movimento
  da página (acende da esquerda até a posição atual, uma vez, respeitando
  `prefers-reduced-motion`).
- **Tempo no estado é sinal operacional:** 7 dias na oficina acende âmbar, 15
  acende vermelho. Calculado pela movimentação mais recente cujo `status_novo`
  é igual ao status atual — usar "a última que mexeu em status" mente quando o
  estado foi ajustado por outro caminho.
- **Mobile-first de verdade**: quem abre está de pé na bancada. Alvo de toque
  nunca abaixo de 44px; `font-size: 16px` nos campos, senão o iOS dá zoom ao
  focar e o formulário sai da vista.
- ⚠️ **`<option>` precisa de cor própria.** A lista aberta do `<select>` é
  desenhada pelo sistema: dar `background` ao select faz o Chrome no Windows
  pintar o popup de branco, e as `<option>` seguem herdando o texto claro —
  branco no branco. O `admin.css` já resolvia isso (`select option`, ~linha
  2679) e a regra não veio junto quando esta folha virou autônoma.
- ⚠️ **SVG inline precisa de largura declarada.** O chevron de "Outras ações"
  ficou do tamanho da página ao trocar de folha: sem `width`/`height` no CSS, o
  SVG assume o tamanho intrínseco (300×150).
- ⚠️ O **detector do Impeccable acusa desvios de DESIGN.md** nesta página. São
  falsos positivos estruturais: o `DESIGN.md` documenta o sistema "Chapa" da
  landing, e esta superfície segue o cartão da assinatura de contrato, que
  nunca esteve documentado ali.
- ⚠️ **A foto é carregada por `fetch` + blob, não por `<img src>` direto.** A
  rota da imagem é autenticada e `<img src>` não manda header `Authorization`.
  A saída fácil seria abrir a rota — é o que
  `/ordens-servico/:id/fotos/:id/imagem` faz — mas aqui o id da foto é
  sequencial e adivinhável, e o conteúdo é o interior da casa de máquinas de um
  cliente. Os object URLs são revogados a cada recarga da ficha.
- **Foto comprimida no navegador** antes de subir (máx. 1280px, JPEG 0.75):
  foto de celular tem 4-8 MB e em base64 infla ~33%, estourando o limite de
  8mb do `express.json`. Mesma lição da assinatura de e-mail e das fotos de O.S.
- **`/login?next=/e/CODIGO`**: sem isso o técnico escaneia, cai no login, entra
  e vai parar no painel — tendo que escanear de novo. O `next` é validado
  contra uma allowlist estreita em `public/login.js` (`^/e/[0-9A-Za-z-]{1,20}$`);
  um `next` livre seria open redirect, já que `//evil.com` é path válido para o
  navegador. Cliente nunca é redirecionado pelo `next` — tomaria 403.

## Admin

Seção **Equipamentos** (`data-section="equipamentos"`): listagem com busca e
filtro de estado, geração de lote e impressão da folha. Clicar numa linha abre
a **mesma** ficha que o QR abre — não existe versão "de escritório" que possa
divergir da versão da bancada. Escondida do `operador` — e desde 27/08/2026
fechada pra ele também no backend, como O.S. e orçamentos.

⚠️ O PDF é gerado sob autenticação, então `window.open` na URL não funciona
(não manda o header e o servidor responde 401). O admin busca como blob e abre
o object URL.

## Cache

`/equipamentos` está na lista **network-first** do `public/sw.js`. Sem isso o SW
serviria a ficha no estado da semana passada em F5 — exatamente o que o módulo
existe para evitar. Ver [`../../CLAUDE.md`](../../CLAUDE.md).

## Referências

- Schema: [`../banco-de-dados.md`](../banco-de-dados.md) (migration 070)
- Endpoints: [`../api.md`](../api.md)
- Fluxo que alimenta a retirada: [`ordens-servico.md`](ordens-servico.md)
  (tipos `retirada_equipamento` e `devolucao`)
