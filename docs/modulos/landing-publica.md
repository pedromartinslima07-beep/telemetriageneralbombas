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
| `public/landing.js` | Revelação, instrumento do hero, trilho da madrugada, diagrama e envio do formulário |
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

O painel do hero roda um roteiro fixo de uma madrugada (78% → 18% → 84%), com
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
- o rótulo "Sem monitoramento" / "Com a General" da madrugada existe no HTML em
  **todas** as larguras — visualmente escondido no desktop (onde os cabeçalhos
  de coluna dão o contexto) e visível no celular, onde a coluna é única. Leitor
  de tela nunca teve o cabeçalho visual;
- "Entrar" permanece na barra em qualquer largura: esconder obrigava um síndico
  que já é cliente a rolar a landing inteira até o rodapé para achar o painel.

---

## Relacionadas

- [`../../PRODUCT.md`](../../PRODUCT.md) — público, posicionamento, provas reais e o que não pode ser inventado
- [`telemetria.md`](telemetria.md) — o mecanismo que a página demonstra
- [`autenticacao.md`](autenticacao.md) — para onde vai o "Entrar"
- [`../api.md`](../api.md) · [`../banco-de-dados.md`](../banco-de-dados.md) · [`../changelog.md`](../changelog.md)
