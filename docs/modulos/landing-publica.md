---
tags:
  - projeto
  - fluxo
aliases:
  - Landing Pública
  - Captação de Lead
  - Página Inicial
  - Chapa
---
# Landing pública e captação de lead

A rota `/` deixou de ser redirect para `/login` e passou a ser a **página de
apresentação do produto para síndicos de condomínio**. Este documento cobre o
fluxo (visitante → lead → equipe comercial) e as decisões de construção da
página que não dá para inferir lendo o CSS.

O "porquê" das escolhas de direção está em
[`../../memory-bank/decisions.md`](../../memory-bank/decisions.md); o sistema
visual detalhado (tokens, componentes) fica em
[`../../DESIGN.md`](../../DESIGN.md); a verdade de produto que a página não
pode contrariar está em [`../../PRODUCT.md`](../../PRODUCT.md).

---

## Arquivos

| Arquivo | Papel |
|---|---|
| `public/index.html` | Markup da landing. Servido por `GET /` (`res.sendFile` em `src/app.js`) |
| `public/landing.css` | Sistema visual completo da página. **Não compartilha nada com `admin.css`** |
| `public/landing.js` | Revelação, instrumento do hero, diagrama e envio do formulário |
| `public/fonts/archivo*.woff2` | Archivo variável (peso 400–900, largura 62–125%) — display e corpo |
| `public/fonts/martianmono*.woff2` | Martian Mono — só leituras de instrumento e etiquetas |
| `public/fotos/*.jpg` | Cinco fotos reais da equipe em serviço |
| `public/logo-topo.png` | Wordmark **sem** a linha "Engenharia da Manutenção" (ver abaixo) |
| `src/routes/leads.routes.js` | `POST /leads` público + `GET`/`PATCH` de gestão |

---

## Fluxo do lead

```
Visitante preenche a ficha em /#assinar
   │  fetch POST /leads  (JSON, sem auth)
   ▼
leadLimiter — 5 requisições por hora por IP
   │
   ▼
Honeypot: campo `site` preenchido?  ── sim ──▶ responde 200 {ok:true} e descarta
   │ não                                        (4xx ensinaria o bot que o campo existe)
   ▼
Valida nome (obrigatório) e e-mail (regex frouxa, de propósito)
   │
   ▼
Trunca todo campo no limite da coluna  ──▶  INSERT em `leads` (+ origem, ip)
   │
   ▼
sendLeadNovo() dispara e-mail para comercial@ — em background, com catch:
falha de e-mail NÃO vira erro para o visitante, porque o lead já está gravado
   │
   ▼
201 {ok, id}  ──▶  front mostra "Recebemos seu contato"
```

Leitura e movimentação do funil (`GET /leads`, `PATCH /leads/:id`) exigem
`authRequired` + `gestaoOnly` — é informação comercial, não operacional.
Endpoints em [`../api.md`](../api.md); tabela em
[`../banco-de-dados.md`](../banco-de-dados.md).

### Campos enviados pelo front

`nome`, `condominio`, `email`, `telefone`, `unidades`, `mensagem`, `site`
(honeypot) e `origem: "landing"`. **O contrato do formulário não muda sem mexer
no backend** — `unidades` só aceita `ate-50`, `51-150`, `151-300`, `acima-300`.

---

## Pegadinhas da página

### ⚠️ A página fala em primeira pessoa do plural — sempre

"Monitoramos", "a gente sabe", "nossa equipe". **Nunca** "A General monitora"
nem "a equipe da General instala". Falar de si na terceira pessoa faz a página
soar como um terceiro apresentando a empresa, e isso contradiz o próprio
argumento de venda: quem fala já é o fornecedor de confiança do prédio, não um
intermediário descrevendo um serviço. O nome "General" fica onde a marca
precisa ser **identificada** (topo, rodapé, metadados), nunca como sujeito.

Regra registrada em [`../../PRODUCT.md`](../../PRODUCT.md) (Brand Commitments)
e no comentário `VOZ:` no topo de `public/index.html`.

### ⚠️ A boia não é vilã — o sistema não substitui boia

Correção do Pedro em 2026-08-13. A página chegou a dizer que a boia "só sabe
dizer cheio ou não cheio" e "não diz nada quando ela mesma falha". Errado por
dois motivos: **o produto não serve para substituir boia**, e a própria General
instala e mantém boia — pôr a boia como deficiente é depreciar o próprio
serviço.

O enquadramento correto é **a boia age, o monitoramento mostra**: ela liga e
desliga a bomba sozinha; o sistema informa quanto tem agora, como o nível se
comportou e se alguma peça — a boia entre elas — precisa de atenção. Responder
"meu prédio já tem boia" continua sendo obrigatório (é dúvida real do síndico),
só não nesses termos. Contrato em [`../../PRODUCT.md`](../../PRODUCT.md).

### ⚠️ Cada frase precisa servir a quem NÃO conhece a General

A página tem dois leitores: o síndico de um prédio que já é cliente da
manutenção e o que está conhecendo a empresa agora. Frases como "a mesma
equipe que já troca a sua bomba" ou "não somos o aplicativo de uma empresa que
você nunca viu" pressupõem o primeiro e não servem ao segundo — que é
exatamente quem a landing precisa converter. **O vínculo existente entra
sempre como condicional** ("se já cuidamos do seu prédio, entra no mesmo
contrato"). O diferencial que vale para os dois é o tipo de empresa:
manutenção predial em casa de máquinas desde 2005, não software.

### ⚠️ Mapa de donos — cada pergunta é respondida por UM bloco

A página chegou a responder cada pergunta em três ou quatro lugares (a lede do
hero e a de `#servico` eram o mesmo parágrafo com outras palavras; a célula 1
narrava o que o instrumento já mostrava; a condicional "se já é cliente"
aparecia em três seções). O critério que resolveu isso não é cortar palavra
repetida — é decidir **quem é dono de cada pergunta** e calar os outros:

| Pergunta | Dono |
|---|---|
| O que vigiamos | instrumento do hero + lede do hero |
| Como funciona, o ciclo | `#servico` |
| Quem instala e atende | `#equipe` |
| O que fica no prédio / obra | `#instalado` |
| Preço, contrato, "já sou cliente" | `#assinar` (o fecho) |
| Painel do condomínio | `.vigia-painel` |
| Credencial "desde 2005" | selo do hero + `#equipe` |

Duas exceções **deliberadas**, não descuido: a **FAQ** pode repetir o que já
foi dito (quem chega lá está procurando resposta pontual, não relendo a
página) e a **lista do fecho** é resumo assumido antes do formulário. Por isso
mesmo, nenhum outro bloco deve repetir o que essas duas já resumem.

### ⚠️ `#servico` explica o SERVIÇO; `#instalado` explica o HARDWARE

`#servico` é o bloco que segura o visitante que chegou agora — se ele não
entender o serviço ali, não chega ao fim da página. Ele conta o **ciclo**:
medimos a cada 10 s → avisamos sozinhos a qualquer hora → atendemos com equipe
própria, mais o painel do condomínio.

**Não descrever sensores aqui.** Uma versão intermediária listava "boia
travada / bomba que não gira / consumo disparado", que é a mesma informação de
`#instalado` (sonda / sensor de corrente / central) com outro nome — o Pedro
apontou a redundância. Se for mexer, mantenha a divisão: um bloco é o que o
serviço faz, o outro é o que fica instalado no prédio.

### ⚠️ A placa de `#servico` é UMA peça, não três cards

`.vigia` é uma peça chanfrada dividida por **cortes gravados** (`--rasgo` +
`--luz`, sempre o par: linha escura = fundo do sulco, fio claro = aresta
pegando luz). Três caixas iguais de título + parágrafo lado a lado é o
contêiner preguiçoso e foi o vício da primeira versão rejeitada — se precisar
mexer aqui, mantenha a peça única. No mobile o sulco **deita** (`border-left`
→ `border-top`), senão as células empilhadas ficam sem divisão.

A numeração 1/2/3 das células é intencional e é a única da página além das
peças: aqui a ordem **é** a informação (não dá para atender antes de medir).

Esta seção substituiu a linha do tempo da madrugada (5 eventos + trilho preso
ao scroll), removida a pedido do Pedro: ver
[`../../memory-bank/decisions.md`](../../memory-bank/decisions.md).

### ⚠️ Não registra service worker, de propósito

O `sw.js` existe para o PWA do painel. Instalar um SW no navegador de um
visitante anônimo que talvez nunca volte não traz benefício e cria mais uma
camada de cache para depurar (ver o "cache em 3 camadas" no
[`../../CLAUDE.md`](../../CLAUDE.md)). Quem vira cliente entra por `/login`,
que registra o SW normalmente.

Mesmo assim, `landing.css` e `landing.js` têm `?v=N` no HTML — **bumpe ao
alterar qualquer um dos dois**.

### ⚠️ CSP: nenhum script inline

`script-src 'self'` do helmet bloqueia `<script>` inline e handlers `onclick`.
Todo comportamento vive em `landing.js`. Fontes e imagens precisam estar em
`public/` — nada de CDN.

### ⚠️ `logo-topo.png` é gerado, não é o logo original

O lockup oficial (`login-logo.png`, 867×288) traz "ENGENHARIA DA MANUTENÇÃO"
embaixo do wordmark. Na barra, a 40px de altura, essa linha fica com ~4px e
vira um borrão cinza — a marca aparecia como artefato de compressão. Como
**não existe versão vetorial** da marca, `logo-topo.png` (826×180) foi gerado a
partir do original apagando todo pixel não-amarelo abaixo da linha de base do
wordmark (remove a assinatura, preserva as engrenagens) e recortando no
conteúdo. O lockup completo aparece **uma vez só**, grande, no rodapé.

Se algum dia aparecer um SVG da marca, ele substitui os dois.

### ⚠️ O instrumento do hero é demonstração, e precisa continuar dizendo isso

O painel do hero roda um roteiro fixo (78% → 18% → 84%), com
`data-estado` alternando `ok` / `baixo` / `critico`. **As faixas são as mesmas
do backend** — baixo abaixo de 45%, crítico abaixo de 20%. Se as faixas mudarem
em `src/services/alertas.service.js`, mudam aqui também (`roteiro` em
`landing.js` e as marcas `.coluna-marca-*` no CSS).

A linha "Demonstração · leituras simuladas" **não é decoração**: é o que separa
a página de fabricar prova. Não existe cliente de telemetria ainda — ver
"Ausências que não podem ser fabricadas" em
[`../../PRODUCT.md`](../../PRODUCT.md).

### ⚠️ A lâmina d'água anda por `transform`, não por `height`

Animar `height` é layout a cada quadro, e escalar a coluna deformaria a crista
de 3px. `.coluna-agua` ocupa o tubo inteiro e desce com
`translateY(calc(100% - var(--n)))`. No celular a coluna deita e vira
`translateX`.

### ⚠️ A máscara de revelação tem geometria, não é só um fade

A entrada por corte usa `mask-image` diagonal a 108° varrendo com
`mask-position`. O canto inferior direito de um elemento **alto** projeta mais
longe no eixo do gradiente que o canto superior direito: com máscara curta
(300%) e parada opaca em 34%, a placa da ficha (480×959) terminava a transição
com uma faixa translúcida atravessando o botão "Enviar". Os valores atuais
(`mask-size: 500%`, parada em 40%) cobrem até altura ≈ 5× a largura. **Ao
aplicar `.rev` num elemento novo muito alto, confira esse limite.**

### ⚠️ Contorno chanfrado não pode ser `box-shadow: inset`

`box-shadow` é recortado junto com o `clip-path`, então a borda desaparece
exatamente nos dois chanfros — lê como defeito. `.btn-fio` resolve com duas
camadas: o fundo do próprio botão é o anel e o `::before`, embutido 1,5px e
chanfrado de novo, é a placa interna. Mesmo padrão do `.instr`.

### ⚠️ Amarelo nunca é texto sobre fundo claro

`#fbb329` sobre placa clara reprova em contraste (~2:1) mesmo como ícone — foi
por isso que o indicador `+` das dúvidas virou marinho. Sobre claro, o amarelo
só aparece como **preenchimento**, com tinta marinho por cima. Sobre marinho
ele é texto normalmente (~9:1).

### ⚠️ O prédio do diagrama é fora de escala de propósito

O `viewBox` é `0 0 460 520` e a torre ocupa 230 unidades contra 180 da casa de
máquinas. **Não "consertar" a proporção.** A versão em escala (torre de 410
unidades, 7 linhas de andar, `viewBox` de 700) fazia com que mais da metade do
desenho fosse retângulo vazio: as três peças moram só nas pontas — uma na
caixa d'água, duas embaixo. Quatro linhas bastam para o desenho ler como
prédio, e o assunto são as duas pontas. A seção caiu de 1077px para 1004px, e
a altura passou a ser definida pela lista de peças, não pelo vão do desenho.

Ao mexer em qualquer coordenada, lembre que **tudo abaixo da linha do solo
(`y=340`) é um bloco solidário**: cisterna, bomba, quadro, sucção, a prumada
de recalque e os marcadores 2 e 3. Mover o solo sem mover o resto junto
desmonta a casa de máquinas.

**Três regras de desenho que custaram tentativa:**

1. **Chanfro nos equipamentos, canto reto na arquitetura.** Caixa, cisterna,
   corpo da bomba, motor e quadro são placas e levam o corte de 45°; o prédio
   leva o chanfro só no topo, como recorte de cobertura. Sem isso o diagrama
   era o único elemento da página com cantos retos — contra a regra de forma
   única do [`DESIGN.md`](../../DESIGN.md).
2. **Marcador fora da peça quando a peça for menor que ~3× o marcador.** Com
   `r=16` sobre um motor de 56 unidades, o círculo amarelo cobria justamente
   o que apontava. Hoje `r=13`, e o marcador 2 fica embaixo do conjunto, com
   fio pontilhado — o mesmo recurso que a sonda da caixa já usava.
3. **A prumada é desenhada em dois traços.** Cheia dos dois lados, encostava
   na borda do prédio e lia como estrutura; totalmente atrás do corpo, sumia e
   a caixa perdia a ligação com a bomba. `.pd-prumada` (4px, opacidade .4)
   dentro do prédio e `.pd-tubo` (7px, .55) na casa de máquinas.

### As linhas-guia da foto anotada são coordenadas do arquivo

As chamadas ("Quadro de comando", "Vaso de pressão", "Bombas de recalque") são
um `<svg viewBox="0 0 960 1280">` sobreposto a `equipe-bombas.jpg`, com as
linhas terminando em `x=590` e os rótulos posicionados em `left: 61.5%`. **Se a
foto for trocada, as coordenadas param de apontar para as peças certas.** Por
isso, abaixo de 420px, rótulo e linha somem juntos — linha sem rótulo aponta
para o nada.

---

## Acessibilidade — não é refinamento, é conversão

O comprador é um síndico voluntário, com frequência mais velho e sem formação
técnica ([`../../PRODUCT.md`](../../PRODUCT.md)). Por isso:

- corpo em 19px (`1.1875rem`), entrelinha 1.65;
- alvos de toque ≥ 44px, campos do formulário com 54px de altura;
- foco visível em amarelo com `outline-offset`, em tudo que é focável;
- "Entrar" permanece na barra em qualquer largura: esconder obrigava um síndico
  que já é cliente a rolar a landing inteira até o rodapé para achar o painel.

---

## Relacionadas

- [`../../PRODUCT.md`](../../PRODUCT.md) — público, posicionamento, provas reais e o que não pode ser inventado
- [`telemetria.md`](telemetria.md) — o mecanismo que a página demonstra
- [`autenticacao.md`](autenticacao.md) — para onde vai o "Entrar"
- [`../api.md`](../api.md) · [`../banco-de-dados.md`](../banco-de-dados.md) · [`../changelog.md`](../changelog.md)
