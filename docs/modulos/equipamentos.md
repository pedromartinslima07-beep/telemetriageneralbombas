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

## A tela do técnico no navegador (10/09/2026)

`/tecnico/painel` — `public/tecnico.html` / `tecnico.js`, com a folha do
operador. Nasceu de um defeito de login: `PAINEL_POR_ROLE` mandava a role
`tecnico` para esse path e o Express não servia página nenhuma ali (ver
[autenticacao.md](autenticacao.md)).

⚠️ **O CELULAR É A CENA PRINCIPAL** — *"o foco desse login é 100% mobile"*.
Uma coluna, alvos de 44px, nada que dependa de hover.

⚠️ **ELA ACHA, NÃO AGE.** A lista responde "onde está esta peça"; quem registra
retirada, conserto, devolução e orçamento continua sendo a **ficha da etiqueta**
(`/e/:codigo`), a mesma que o QR abre. Repetir as ações aqui criaria dois
lugares para dizer a mesma coisa sobre a mesma bomba.

⚠️ **O ESTADO É O CABEÇALHO DO GRUPO, não um selo por linha.** A lista agrupa
pelos estados na ordem do ciclo, então um selo repetiria a mesma palavra — e a
320px "AGUARDANDO ORÇAMENTO" em mono estourava a placa.

⚠️ **"Na oficina" é um FILTRO, não um estado**: `oficina`,
`aguardando_orcamento`, `aguardando_peca` e `em_conserto` querem todos dizer "a
peça está parada aqui dentro", que é a pergunta de quem abre a tela.

⚠️ **A folha é a `operador.css`**, e o bloco `.eq-*` mora nela. A tela tem a
mesma barra, a mesma gaveta de conta e os mesmos diálogos das telas do
operador; uma sexta cópia dos tokens divergiria no primeiro ajuste. A regra que
continua valendo é a do topo daquele arquivo: ela não herda de `admin.css`.
- ⚠️ Duas regras de celular precisaram de exceção por classe no `<body>`
  (`tela-equip`): abaixo de 760px a folha esconde o nome da tela e abaixo de
  420 esconde a `.barra-in` inteira, porque **lá** a marca disputa com três
  links de navegação. Aqui não há navegação nenhuma, e a mesma regra deixava a
  barra do celular com um avatar e mais nada.

### Escanear a etiqueta pela câmera do navegador (10/09/2026)

Pedido do Pedro: *"coloque uma parte para abrir a câmera e escanear o qr code
para cadastro"*. Botão **Escanear etiqueta** na tela do técnico; a leitura abre
`/e/:codigo`, que é a ficha — e, numa etiqueta em branco, é a tela de cadastro.

⚠️ **Isto não contradiz "sem plugin de scanner no app".** Aquela decisão é sobre
o **app Capacitor**, cujo build Android está sob o prazo da Play Store. Aqui não
há build nenhum: é o navegador do celular pedindo a câmera.

⚠️ **Sem biblioteca.** A CSP do helmet é `script-src 'self'` — script de CDN não
executa, e sem erro visível. Quem lê é o `BarcodeDetector` do próprio navegador.

⚠️ **O QR guarda a URL, não o código** (`<base>/e/CODIGO`). Mandar o texto cru
para a ficha daria `/e/https://...`. O `codigoDe` aceita as duas formas, mais o
hífen do código impresso — que existe só para leitura humana e não está no banco.

⚠️ **`setTimeout`, não `requestAnimationFrame`.** O rAF é o laço padrão para
isto e **não dispara em aba de segundo plano nem em janela sem foco**: medido
com o vídeo tocando e zero chamadas ao detector. Numa tela que existe para ler
um QR, um laço que pode nunca rodar é um retângulo preto que o técnico encara
sem entender. 150 ms é folgado para QR e poupa bateria.

⚠️ **Parar as trilhas à mão.** Só remover o `<video>` do DOM deixa a câmera
**ligada** — a luz do aparelho fica acesa. `pararCamera()` roda no fechar, no
Esc, no `pagehide` e antes de navegar para a ficha.

⚠️ **NÃO HÁ CAMPO PARA DIGITAR O CÓDIGO NO DIÁLOGO**, e ele existiu por umas
horas: entrou como plano B do QR sujo e o Pedro o tirou no mesmo dia. O diálogo
é de uma coisa só — apontar a câmera. Quem precisa achar uma peça sem escanear
usa a **busca da tela**, que já procura por código, apelido e prédio; duas
portas para a mesma coisa, uma delas dentro de um diálogo de câmera, é o
acúmulo que esta tela existe para não ter.

⚠️ **Toda falha de câmera oferece "Tentar de novo"** e nomeia a saída: o app de
câmera do próprio celular lê a etiqueta e abre a ficha. Quase toda falha aqui é
recuperável (permissão recusada sem querer, câmera presa em outro aplicativo), e
sem o botão o caminho seria fechar e reabrir — que é o que ele faz sem obrigar
ninguém a descobrir.

⚠️ **`[hidden]` precisa ser repetido no CSS do botão.** O atributo esconde por
uma regra do navegador, e o `display:inline-flex` do `.btn` é uma classe: vence
por especificidade. Sem a linha, o "Tentar de novo" aparecia com a câmera
funcionando, oferecendo consertar o que não estava quebrado.

⚠️ **No celular a ficha ocupa a tela inteira** (regra da folha, certa para os
diálogos densos do operador). Um miolo de duas linhas herdava isso e ficava
pendurado no topo de uma chapa vazia de 857px — medido. O miolo cresce e centra:
a mira fica no meio do aparelho, que é onde a mão aponta.

**Onde funciona.** `BarcodeDetector` é nativo do Chrome no **Android**, que é a
cena de uso. **Não existe** no Safari (iPhone), no Firefox nem no Chrome de
Windows — ali o diálogo diz isso e aponta o caminho que já funciona: o app de
câmera do próprio celular, que abre a ficha pelo QR.
Se algum técnico usar iPhone, o caminho é hospedar um leitor local em
`public/static/` (a CSP permite `'self'`), como já é feito com Leaflet e
ApexCharts.

⚠️ **A câmera exige contexto seguro.** Em `http://` que não seja `localhost`,
`navigator.mediaDevices` nem existe — testar pelo IP da rede local (`http://192.168…`)
**não** vai pedir câmera. Produção é HTTPS e funciona.

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
(`#0d2775`) com o wordmark branco **centrado numa barra inteira**, campo branco
com o QR e o código sublinhado pelo fio amarelo
(`#fbb329`), e o pé com a propriedade. O logo é `public/login-logo.png`
(wordmark branco + engrenagens, fundo transparente), lido uma vez e injetado
como data URI numa **classe CSS** — repetir a imagem em cada célula inflaria o
HTML em ~1,3 MB por folha.

- ⚠️ **O QR fica sempre preto sobre branco.** Invertido (claro sobre escuro)
  muitos leitores de celular não pegam, e etiqueta que não escaneia é papel
  colado à toa numa bomba. Por isso a cor da marca vive na cabeça e no fio, não
  no campo do código.
- ⚠️ **A cabeça impressa NÃO leva chanfro** (2026-09-10): a barra marinho vai
  inteira, de corte a corte, com o wordmark centrado. Tela e papel não são a
  mesma coisa — no monitor o corte de 45° é a assinatura da marca, mas impresso
  e recortado à tesoura ele deixa de ler como intenção: de perto vira ponta
  amassada, de longe a faixa parece entrar torta na impressora. Duas geometrias
  foram tentadas antes de desistir (a que subia até 30% da altura da cabeça, e a
  de 45° exato com o mesmo recuo nos dois eixos) e as duas leram torto no papel.
  **Não recoloque o corte aqui**; ele fica nas telas. O campo `medidas.chanfro`
  continua declarado porque a `.ficha-cabeca` do `public/equipamento.css` ainda
  desenha o corte na tela.
- **Correção de erro `H`** (~30% do código recuperável): etiqueta de casa de
  máquinas vive com graxa, respingo e sol. O código humano impresso ao lado é o
  plano B quando nem isso resolve.
- **Três formatos** (`FORMATOS` em `src/services/etiquetas-pdf.service.js`):
  `corte` (padrão — papel comum, **quadrada de 65 × 65 mm**, 12 por folha, só
  faixa da marca + QR), `grande` (130 × 80 mm, 3 por folha — papel comum, pra
  recortar e plastificar quando o QR precisa ser lido de longe ou não há folha
  adesiva à mão) e `pimacoA4263` (A4263 / Avery L7163, 14 por folha,
  99 × 38,1 mm).
  Nas folhas adesivas a margem precisa bater com a picotagem e a borda tracejada
  é omitida, pra não imprimir traço em cima do adesivo — nos formatos de papel
  comum ela fica, porque ali é a linha da tesoura.
- **O papel comum é quadrado e mudo** (`layout: "quadrado"` no formato, que
  troca o template da célula por um só com cabeça + QR). O desenho retangular
  anterior (95 × 52 mm) gastava metade da largura com o código humano e a dica
  escritos ao lado do QR; quem recorta à tesoura quer o QR o maior possível na
  menor sobra de papel, e 3 × 65 + 2 mm de medianiz cabem nos 210 da folha —
  12 etiquetas contra as 10 de antes, com o QR indo de 26 para **44 mm**.
  O logo fecha em 46 × 10 mm, centrado na barra de 65 — sobram uns 9 mm de cada
  lado. A folga lateral da faixa (`medidas.padCabecaX`) fica em 3 mm, contra os
  4 do padrão, e hoje é só o limite de segurança: com o wordmark centrado, quem
  define a margem é a largura dele.
- **O arquivo do logo é por formato** (`logo` na entrada de `FORMATOS`, com
  cache por nome). O `corte` usa `public/logo-topo.png` — o mesmo lockup do
  cabeçalho da landing, **sem** a linha "Engenharia da Manutenção". Os demais
  ficam no `login-logo.png` (padrão), que traz a linha. Em faixa baixa a linha
  vira borrão na impressão; sem ela o wordmark ocupa a faixa inteira.
  ⚠️ Aqui **não há código humano impresso**: nesta folha o plano B do QR sujo é
  reimprimir a etiqueta, não digitar o código. Os formatos `grande` e
  `pimacoA4263` seguem com o código.
- ⚠️ **O `grande` só cabe uma por linha**: 2 × 130 mm estouraria os 210 mm da
  folha. Como não há picotagem a respeitar, a grade é centralizada (40 mm de
  cada lado), ao contrário das adesivas, cuja margem vem da tabela do
  fabricante.
## Descartar um lote de etiquetas

Folha impressa errada, teste de alinhamento, lote gerado a mais: botão **Apagar
lote** no card "Imprimir folha de etiquetas"
(`DELETE /equipamentos/lote/:lote`).

- **`masterAdminOnly`**, e não o `gestaoOnly` do resto do módulo: apagar linha
  do banco em lote é irreversível, e é a régua que o projeto já usa para esse
  nível (apagar cliente, mexer em reservatório). Gerente imprime etiqueta; só o
  admin master descarta o que foi impresso. O botão some para quem não é master,
  mas ⚠️ **esconder não é a trava** — quem vale é o guard da rota.
- ⚠️ **Só apaga etiqueta virgem** (`etiqueta_livre` e sem nenhuma movimentação).
  Equipamento com histórico no meio do lote é deixado quieto e volta em
  `preservados`, **nunca inativado em silêncio**: quem pediu para apagar "o lote
  de teste" precisa descobrir ali que o lote não era só teste. A linha do tempo é
  o ativo do módulo, e ela não volta.
- A confirmação exige **digitar o nome do lote**, não um "tem certeza": o
  seletor é o mesmo que a pessoa acabou de usar para imprimir, e o `.env` aponta
  para produção.
- Teste: `node scripts/testes/apagar-lote-etiquetas.test.js` (banco de teste,
  limpa o que cria).

## Reaproveitar uma etiqueta cadastrada por engano

Cadastro feito na etiqueta errada — acontece porque o vínculo é feito no
corredor, com a bomba na mão. Card **Reaproveitar etiqueta** na tela de
Equipamentos (`POST /equipamentos/:id/desfazer-cadastro`), que devolve a
etiqueta a `etiqueta_livre` para ser vinculada de novo.

- ⚠️ **Sem isto o código ficava queimado para sempre.** O
  `DELETE /equipamentos/:id` não apaga quem tem movimentação: ele dá **baixa**.
  O equipamento some da operação, mas o código continua ocupado e a etiqueta
  colada na bomba vira papel morto. Não existia caminho de volta.
- **`masterAdminOnly`** (decisão do Pedro, 10/09/2026): isto **apaga linha do
  tempo**, que é o ativo do módulo — mesma régua do descarte de lote.
- ⚠️ **Só desfaz o vínculo inicial.** Se a etiqueta já juntou foto, chamado,
  orçamento, O.S. ou qualquer movimentação além do `cadastro`/`retirada` de
  abertura, a rota responde **409 com `impedimentos`** (a contagem de cada
  coisa) e não encosta em nada. Aí o caminho é a baixa, que preserva. A resposta
  diz **o que** impede de propósito: um "não pode" seco empurra a pessoa a mexer
  no banco na mão.
- ⚠️ **`forcar: true` é a exceção estreita, e ela tem limite.** O primeiro caso
  real (990H-3TJP, 10/09/2026) foram **três cliques da mesma pessoa em um minuto
  e meio** — cadastro, entrada na oficina, aguardando peça — e a regra acima
  recusou por "2 movimentações além do cadastro". Aquilo não era histórico, era
  alguém andando pelo fluxo na etiqueta errada. Com a flag o admin master passa
  por cima das **movimentações, e só delas**: foto, chamado, orçamento e O.S.
  recusam mesmo forçando, porque aí existe trabalho de outra pessoa pendurado —
  apagar isso não é desfazer um engano, é sumir com o serviço de alguém. O 409
  devolve **`pode_forcar`** para o front não precisar deduzir a regra do
  servidor pela contagem, e o painel só então faz a segunda pergunta.
- **O código vai no body e tem que bater com o do `:id`.** É a mesma trava do
  "digite o nome do lote", só que no servidor: id errado na URL zeraria a ficha
  da bomba errada, e o `.env` aponta para produção.
- **O que volta a NULL:** `condominio_id`, `vinculado_em` e todos os
  `CAMPOS_EDITAVEIS`; o status vira `etiqueta_livre` e `ativo` volta a `true`.
  **Ficam de pé** `codigo`, `lote`, `criado_em` e `criado_por` — é a mesma folha
  impressa no mesmo lote; o que se desfaz é o cadastro posto nela.
- ⚠️ **Não fica rastro no banco, de propósito.** A etiqueta precisa ficar
  indistinguível de uma recém-impressa, senão a próxima ficha nasce com uma nota
  de erro que não é dela. O rastro fica no log do servidor (código, id, quem
  pediu, quantas movimentações caíram).
- Teste: `node scripts/testes/desfazer-cadastro-etiqueta.test.js` (banco de
  teste, limpa o que cria).

- ⚠️ **A grade das folhas adesivas sai da tabela do fabricante, não de conta
  de padeiro.** A Pimaco publica os parâmetros de cada folha no `.doc` de
  "Parâmetros de Impressão" (`editor.pimaco.com.br/documents/parametros/`).
  Para `A4063/A4263/A4363`: margem superior **1,52 cm**, margem lateral
  **0,47 cm**, densidade vertical **3,81 cm**, densidade horizontal
  **10,16 cm**, etiqueta **3,81 × 9,90 cm**, 2 por linha × 7 linhas. Daí saem o
  `gapX` de 2,6 mm (10,16 − 9,90) e as margens do formato. **Centralizar a
  grade não substitui isso** — coincidiu nesta folha, e não vai coincidir na
  próxima.
- ⚠️ **A arte não encosta no corte.** `medidas.safe` recua o desenho para
  dentro da célula (1,5 mm na A4263). O registro de papel de impressora
  doméstica varia ~1 mm entre folhas; com sangria total e `gapY` zero, esse
  milímetro faz a faixa marinho aparecer mordida ou invadindo a etiqueta
  vizinha — que é como o desalinhamento se manifesta na prática, mesmo com a
  grade correta. `safe: 0` (formatos antigos) mantém a arte ocupando a célula.
- **Calibração `&dx=`/`&dy=`** (mm, limitados a ±5) deslocam a grade inteira.
  Existem porque o desvio que sobra é da **máquina**, não do arquivo: imprima,
  meça contra o adesivo e repita com o desvio invertido (saiu 1 mm para baixo →
  `&dy=-1`).
- ⚠️ **`preferCSSPageSize: true` no `page.pdf`**: sem ele o Chrome usa o A4
  dele (8,27 × 11,69 pol arredondadas) em vez do `@page` do CSS, e a grade
  adesiva perde as frações de milímetro que a picotagem cobra.
- ⚠️ **Imprimir em escala 100% / tamanho real.** Este é o desalinhamento mais
  comum, e tem assinatura própria: **erra no topo, acerta no meio, erra de novo
  embaixo**, com o desvio crescendo para as pontas e os lados errando junto. É
  escala centrada — o driver reduziu a página inteira para caber na área
  imprimível (muita jato de tinta não imprime até a borda). No centro de uma
  redução centrada o erro é zero; por isso o meio da folha parece certo.
- **A calibração tem UI** — bloco recolhido "Calibrar impressora" no card
  "Imprimir folha de etiquetas" do admin (`eqCalDx` / `eqCalDy` /
  `eqCalEscala`). ⚠️ Sem ela os parâmetros seriam inalcançáveis: o PDF é
  buscado com header `Authorization` e aberto como object URL, então **não dá
  para colar a URL com query string no navegador** — voltaria 401. Vale para
  qualquer parâmetro novo dessa rota.
- **Compensação `&escala=`** (%, 90–110) amplia o conteúdo para sobreviver a
  driver que reduz e não deixa desligar. Meça uma distância conhecida no papel e
  devolva a razão: entre o topo da 1ª e o da 7ª linha há **228,6 mm**; se
  saíram 220, use `&escala=103.9`. Não use junto com impressão em 100% — aí a
  compensação vira erro.
- ⚠️ **Etiqueta menor não é a mesma arte reduzida.** Na A4263 a altura cai de
  50,8 para 38,1 mm: a faixa marinho e o QR do desenho original não cabem
  juntos, e o CSS estourando empurraria o pé para fora do adesivo. Por isso cada
  formato pode declarar um bloco `medidas` (altura da faixa, chanfro, tamanho do
  logo e do QR, corpos de letra) que sobrepõe `MEDIDAS_PADRAO`. Ao criar formato
  novo, **renderize a folha e olhe** — `renderHTML` é exportado justamente pra
  screenshot sem gerar PDF.
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

**Sistema "Chapa" em registro de operação**, o mesmo do
[painel do operador](painel-operador.md) e do [admin](painel-admin.md) — desde
2026-09-08, a pedido do Pedro (*"essa tela está com o visual antigo, traga para
o visual da tela de operador"*).

⚠️ **Isto substituiu o padrão da tela de assinatura de contrato** (`_shell` em
`src/routes/assinatura.routes.js`), que era o pino desta superfície desde
2026-08-18: cartão `#111326` de 520px, fio âmbar→azul, radius 16, sombra
projetada e âmbar `#f0b014`. Aquele padrão era uma identidade a mais no
produto — nasceu antes de o Chapa cobrir as telas internas. **A tela de
assinatura em si NÃO foi migrada junto** e segue nele; se um dia for, é a mesma
conversa.

**A forma da tela é a da etiqueta que acabou de ser escaneada:** faixa marinho
(no `#0d2775` exato da faixa impressa), o código Crockford em Martian Mono e o
estado, chanfrada a 45° no canto inferior direito — o mesmo desenho que sai do
`src/services/etiquetas-pdf.service.js` e está colado na bomba que a pessoa tem
na frente. Engrenagem marinho-sobre-marinho ao fundo, raio zero e nenhuma
sombra projetada.

⚠️ **O CORPO É MARINHO, e isso foi corrigido no mesmo dia da migração.** A
primeira versão pôs a leitura em placa clara — defensável pela Regra da
Superfície ("é o conteúdo, campo marinho em volta"), mas errada quando se abre
a família lado a lado no navegador, que foi o que o Pedro mandou fazer: o
[painel do operador](painel-operador.md), o [do cliente](painel-cliente.md) e a
[landing](landing-publica.md) são **todos marinho**, e a ficha era a única
superfície clara do produto. Não parecia outra tela do sistema; parecia outro
sistema.

**Placa clara aqui veste duas coisas e só duas:** o formulário da etiqueta em
branco (`.is-claro` — uma tela inteira de digitação, como o login) e o diálogo
de orçamento (`.dialogo`, que abre por cima). As duas telas nunca aparecem
juntas, e a troca de superfície diz *"agora é aqui, você vai escrever"*.
Converter é **remapear token no contêiner**, não reescrever seletor.

**Simulador do ciclo** — `node scripts/simular-equipamento.js` sobe a ficha
REAL (`public/equipamento.*`) contra um backend em memória, em
`http://localhost:4700`. Serve para percorrer o caminho inteiro clicando
(etiqueta em branco → retirada → oficina → orçamento → peça → conserto →
pronta → devolvida) e ver a tela mudar a cada passo, sem login e sem tocar no
banco. `/reiniciar` volta a etiqueta ao começo.
⚠️ **Não é teste**: o `STATUS_POR_TIPO` de lá é cópia do desta rota e não
acusa nada quando a rota de verdade muda — só continua mentindo do jeito
antigo. Quem testa a rota é `scripts/testes/`.
⚠️ O código da etiqueta simulada precisa ser **Crockford válido** (sem I, L, O,
U): o front normaliza I→1 e O→0 antes de chamar a API, e um código com essas
letras chega transformado e cai em "Etiqueta não encontrada".

⚠️ **A marca é o `logo-topo.png`, nunca o `login-logo.png`.** O lockup completo
traz "ENGENHARIA DA MANUTENÇÃO" embaixo, que na altura da faixa vira borrão
cinza — a mesma nota que já estava no `cliente.css`, no `landing.css` e no
`operador.html`, e que esta folha nasceu contrariando. O lockup inteiro aparece
uma vez só, grande, no login e no rodapé da landing.

⚠️ **A escada `--surface` faltava no `:root` desta folha**, e o defeito só
apareceu no navegador: `.ficha::before` pintava `var(--surface)`, que não
existia, e custom property inválida resolve para **transparente sem erro
nenhum**. A ficha ficava com o fundo do body e a engrenagem, que devia passar
por trás, aparecia através dela.

⚠️ **O ESTADO MORA NA FAIXA, não na placa.** Como selo preenchido de amarelo
logo acima do trilho, ele dava duas regiões amarelas disputando a mesma tela e
o "a bomba está aqui" do trilho morria — é a Regra do Campo Único. Sobre
marinho o amarelo é livre como tinta, então o código continua âmbar e o estado
sai em branco.

⚠️ **Continua sem carregar `admin.css`**, como a folha do operador. Os tokens
são duplicados de propósito (mesma situação das outras superfícies do Chapa):
são páginas servidas separadamente e não compartilham CSS. **Mudou a paleta?
Mude nas oito folhas.** Ganho colateral que já valia antes: a ficha não baixa
265 KB de CSS do painel numa tela aberta pelo celular, na casa de máquinas,
muitas vezes em rede ruim.

**Direção: "próxima ação única"** (2026-08-18). A tela responde *o que aconteceu
com essa bomba agora* e oferece **uma** ação, escolhida pelo estado; as demais
ficam recolhidas em "Outras ações". A primeira versão era quatro caixas de peso
igual (Registrar / Fotos / Dados / Histórico) — o layout que qualquer CRUD
produz. O contrato da direção está no topo de `equipamento.html`, como comentário
HTML; estratégia em `.impeccable/surfaces/public-equipamento-html.md`.

- **Uma placa só, seções separadas por `hr.divider`.** Nada de caixa dentro de
  caixa: a hierarquia vem da ordem e do peso tipográfico, não de molduras.
  Repor cards ali devolve o problema original.
- **A régua do tempo** é a peça do [painel do operador](painel-operador.md)
  trazida para cá (2026-09-08, segundo passe): a pergunta da bancada é *"há
  quanto tempo isso está parado aqui"*, e ela estava respondida numa frase de
  15px no meio do texto. Agora é um número em Martian Mono na coluna à
  esquerda, como o relógio de SLA do item da fila.
  ⚠️ **A medida é uma placa, não um preenchimento da coluna** — a lição de
  31/08 no operador. E **só o crítico preenche**: a atenção fica de fio com
  tinta `--atencao-t`, porque o campo amarelo desta tela já pertence à parada
  acesa do trilho.
- **A faixa de segurança a −45°** fecha o pé da placa — a mesma peça que fecha
  o hero da [landing](landing-publica.md), na mesma inclinação e no mesmo
  passo. Não é campo amarelo; é limite.
- **O traço curto antes de cada etiqueta de seção** é o gesto da landing
  (*"— CUIDAMOS DE CASA DE MÁQUINAS DESDE 2005"*). ⚠️ Lá o traço é amarelo
  porque pousa sobre marinho; aqui é marinho, pela Regra do Amarelo Cego.
- **O trilho do ciclo** (No prédio → Oficina → Pronta → Devolvida) é conteúdo,
  não enfeite: a posição sai das movimentações. É o único momento de movimento
  da página (acende da esquerda até a posição atual, uma vez, respeitando
  `prefers-reduced-motion`).
- **Tempo no estado é sinal operacional:** 7 dias na oficina acende atenção, 15
  acende crítico. ⚠️ Sobre a placa clara isso é a família `-t`
  (`--atencao-t` / `--risco-t`), **nunca** o sinal saturado — que ali reprova
  contraste como texto. Mesma regra do painel do cliente e dos diálogos do
  admin. Calculado pela movimentação mais recente cujo `status_novo`
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
- **O detector do Impeccable ficou limpo** com a migração (só os avisos de
  `font-size` fora da rampa, que o `DESIGN.md` registra como estado das oito
  folhas, não como defeito desta). Antes eram desvios estruturais reais: a
  superfície seguia um padrão que nunca esteve documentado no sistema.
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
