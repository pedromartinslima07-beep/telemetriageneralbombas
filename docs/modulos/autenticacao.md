---
tags:
  - projeto
  - fluxo
aliases:
  - Autenticação
  - Login
  - OTP
---
# Fluxo: Autenticação

Login com 2FA por email (OTP) e dispositivos confiáveis.

## Duas portas: senha (equipe) e código (cliente)

⚠️ **O cliente não tem senha — 25/08/2026.** Quem cria o acesso do síndico é o
escritório, no admin, com o e-mail dele; a partir daí **o e-mail é a
credencial** e o código de 6 dígitos é a prova.

O motivo é uma constatação sobre o que já existia: em produção o OTP era
**obrigatório em todo login** (`if (!isProd && OTP_DISABLED)` — o atalho só
vale fora de produção). Ou seja, a senha do síndico nunca foi o que protegia a
conta: quem controla o e-mail entra de qualquer jeito. Ela só somava trabalho —
alguém criava, mandava por e-mail (o pior lugar para uma senha estar), e o
síndico esquecia. **E não há recuperação de senha em lugar nenhum do sistema**,
então esquecer significava depender do escritório.

| | Equipe interna | Cliente (síndico) |
|---|---|---|
| Entra com | e-mail + senha, depois código | e-mail, depois código |
| Passo 0 (quem é) | `POST /auth/metodo` → `"senha"` | `POST /auth/metodo` → `"codigo"` |
| Rota do passo 1 | `POST /auth/login` | `POST /auth/codigo` |
| Passo 2 | `POST /auth/verify-otp` | **o mesmo** `POST /auth/verify-otp` |
| `usuarios.senha_hash` | bcrypt da senha escolhida | bcrypt de 32 bytes aleatórios |

⚠️ **`/auth/codigo` só atende `role = 'cliente'`.** Se atendesse qualquer um,
seria um atalho que dispensa a senha do admin — quem tem senha continua
obrigado a digitá-la.

⚠️ **A resposta de `/auth/codigo` é neutra.** E-mail que não existe (ou que não
é de cliente) recebe o mesmo `{ pending: true }`, com um `otp_token` que aponta
para ninguém (`id: null`); o código digitado depois não casa e a resposta é
"Código inválido ou expirado", igual à de um código errado. Sem isso, o
endpoint vira um verificador de quais e-mails são clientes da casa.

⚠️ **`usuarios.senha_hash` continua `NOT NULL`** — não houve migration. O
cliente nasce com o hash de 32 bytes aleatórios que ninguém conhece: uma senha
que não existe, sem coluna nova. O `/auth/login` com senha nunca vai casar para
ele.

Na interface: o modal de usuário do admin esconde o campo de senha quando o
tipo é Cliente (e a lista esconde o botão de resetar senha, que para ele não
significa nada). O cartão de entrada da página de orçamentos usa o mesmo par de
rotas — ver [painel-cliente.md](painel-cliente.md).

## A tela de login não pergunta quem você é (25/08/2026)

Até aqui a `/login` tinha um botão **"Sou do condomínio — entrar sem senha"**
que trocava o modo da mesma placa. A pessoa precisava se classificar antes de
digitar qualquer coisa — e o que ela classificava era a nossa modelagem de
dados. Quem cai na tela vindo do link do orçamento não sabe se é "condomínio"
ou "equipe"; sabe o próprio e-mail.

Hoje são **três passos, não dois modos**:

| Passo | O que a tela mostra | Rota |
|---|---|---|
| `email` | só o campo de e-mail, botão "Continuar" | `POST /auth/metodo` |
| `senha` | e-mail gravado como etiqueta + campo de senha | `POST /auth/login` |
| `otp` | e-mail gravado como etiqueta + código de 6 dígitos | `POST /auth/verify-otp` |

O síndico nunca vê a palavra "senha"; a equipe nunca vê "código" no primeiro
passo. Quem cai em `codigo` pula direto para o passo do OTP — o `/auth/codigo`
é disparado sem clique extra, porque não há segundo campo para preencher.

**A alternativa descartada foi separar os domínios** (um subdomínio para o
cliente). Custa DNS, certificado, sessão que não atravessa domínio, service
worker duplicado e o dobro do `?v=N` — e não resolve: quem salvou o link errado
continua caindo no lugar errado, agora sem botão para corrigir. Separar **move**
a escolha para a URL em vez de eliminá-la. Ver
[decisions.md](../../memory-bank/decisions.md).

## Passo a passo

0. **`POST /auth/metodo`** (`metodoLimiter`, 40 por IP / 15 min) — recebe só
   `email`, responde `{ metodo: "senha" | "codigo" }`.
   - **Não autentica nada**: não emite token, não lê senha, não dispara e-mail.
     Só escolhe qual campo a tela mostra em seguida.
   - `role` existente e diferente de `cliente` → `"senha"`. Todo o resto,
     **inclusive e-mail que não existe** → `"codigo"`.
   - ⚠️ E-mail desconhecido responde `"codigo"` de propósito: um "esse e-mail
     não existe" transformaria a tela de login num verificador de quem tem
     conta. Ele segue para o passo do código, recebe o `otp_token` que aponta
     para ninguém (ver a resposta neutra do `/auth/codigo`) e o código nunca
     casa.
   - ⚠️ **O que este endpoint revela**, e por que é aceitável: quem já saiba que
     um e-mail está cadastrado consegue distinguir **interno de cliente**. Não
     dá para evitar sem devolver a tela ao botão de auto-classificação — a
     escolha do campo é, por definição, pública. O que continua protegido é o
     que importa: `cliente` e inexistente respondem igual, então a **existência
     da conta** não vaza.

1. **`POST /auth/login`** (`loginLimiter` + `senhaPorEmailLimiter`) — recebe
   `email` + `senha`.
   **Equipe interna.** Cliente não passa por aqui: ele não tem senha que case.
   - Valida senha com bcrypt contra `usuarios.senha_hash`.
   - Se o request traz cookie de **trusted device** válido (`trusted_devices`,
     não expirado), pode pular o OTP e emitir o JWT direto.
   - Caso contrário, gera OTP de 6 dígitos em `login_codes` (expira em 10 min) e
     envia por email via **Resend** (`email.js`).
   - Em dev, `OTP_DISABLED=true` (lido com `.trim()`) desativa o 2FA.

1b. **`POST /auth/codigo`** (`loginLimiter` + `codigoPorEmailLimiter`) — recebe
   só `email`. **Cliente.**
   - Busca usuário com aquele e-mail **e `role = 'cliente'`**; recusa
     condomínio encerrado (`_bloqueioDeCliente`, mesma checagem do login).
   - Aparelho confiável válido → emite o JWT direto, sem código (mesmo atalho
     do login com senha).
   - Senão, grava o código em `login_codes` e envia por e-mail. Devolve
     `{ pending: true, otp_token }` — o **mesmo formato** do passo 1.

2. **`POST /auth/verify-otp`** (`otpLimiter`) — recebe o código.
   Serve aos dois caminhos sem nenhuma bifurcação: o `otp_token` emitido em
   `/auth/codigo` é idêntico ao emitido em `/auth/login`.
   - ⚠️ **Teto de 5 erros POR CÓDIGO** (`login_codes.tentativas`, migration
     075). O `otpLimiter` conta por IP, e IP é barato: quem aluga proxy
     residencial comprava mais 10 chutes por endereço, com o código válido
     pelos 10 minutos inteiros e 1.000.000 de combinações que nem precisam ser
     cobertas todas. Ao 5º erro o código é queimado (`used = TRUE`) e a pessoa
     pede outro — daí em diante quantos IPs o atacante tem deixa de importar.
   - A busca **não filtra mais por `code`**: precisa achar o código ativo para
     contar o erro. A comparação virou `_codigoConfere`, em tempo constante.
     ⚠️ `code` é `CHAR(6)` e volta do Postgres com padding de espaço — sem
     `trim` dos dois lados, todo código legítimo é reprovado.
   - Valida contra `login_codes` (não usado, não expirado), marca `used`.
   - Emite **JWT** (7 dias, assinado com `JWT_SECRET`) com `id`, `role`,
     `condominio_id`.
   - Se o usuário pediu "lembrar deste dispositivo", grava `trusted_devices`
     (token aleatório) e seta cookie httpOnly + SameSite (30 dias).

3. Cliente guarda o JWT (localStorage) e o envia em `Authorization: Bearer`.

## Tetos de tentativa: por IP e por e-mail

Todo limitador do arquivo contava por IP, e **IP é barato** — proxy residencial
se aluga aos milhares. Contra quem tem muitos endereços, teto por IP não
protege uma conta específica; protege só contra o atacante preguiçoso. Desde
25/08/2026 os endpoints que mexem com uma conta nomeada têm um segundo teto,
chaveado pelo **e-mail do corpo** (normalizado: `trim` + minúsculas, senão a
mesma conta com outra grafia teria cota própria e o teto seria de mentira).

| Endpoint | Por IP | Por e-mail | Contra o quê |
|---|---|---|---|
| `/auth/metodo` | 40 / 15 min | — | varredura de e-mails |
| `/auth/login` | 20 / 15 min | 10 / 15 min | chute de senha distribuído |
| `/auth/codigo` | 20 / 15 min | 5 / 15 min | encher a caixa da vítima de códigos |
| `/auth/verify-otp` | 10 / 15 min | **5 por código** (migration 075) | chute do código de 6 dígitos |

⚠️ **O preço, assumido:** dá para travar o login de uma pessoa conhecida por 15
minutos gastando o teto dela. É incômodo, e é melhor que a alternativa — sem o
teto por e-mail, a mesma pessoa fica exposta a chute de senha vindo de mil IPs.

⚠️ **O teto por e-mail não vale para `/auth/metodo`**, e não é esquecimento:
quem varre e-mails usa endereços **diferentes** a cada request, então uma cota
por e-mail não é tocada. Ali só o teto por IP faz alguma coisa.

## O que a tela de login revela, e o que não revela

| Pergunta | Dá para responder? |
|---|---|
| "Este e-mail tem conta no sistema?" | **Não** — cliente e inexistente respondem igual |
| "Este e-mail é de um colaborador interno?" | **Sim** — é o preço do identifier-first |
| "Qual é a senha / o código?" | Não, com os tetos acima |

O segundo item é um vazamento **novo**, criado em 25/08/2026: antes, nenhum
endpoint distinguia um e-mail do outro. Não dá para evitar sem devolver a tela
ao botão de auto-classificação, porque escolher qual campo mostrar é, por
definição, público. O uso realista para um atacante é montar a lista de quem
trabalha na empresa e fazer phishing direcionado — o que importa aqui, já que
o segundo fator chega justamente por e-mail.

⚠️ **A decisão do `/auth/metodo` é cosmética, e o servidor não confia nela.**
Forjar `metodo: "codigo"` para um e-mail de admin não leva a lugar nenhum: o
`/auth/codigo` filtra `role = 'cliente'` no próprio SQL e responde neutro.
Nenhum caminho de autenticação depende do que o front decidiu mostrar.

## Quanto tempo a sessão dura

Três prazos, e eles não são a mesma coisa:

| O quê | Prazo | Conta com o navegador fechado? |
|---|---|---|
| Inatividade (`public/inatividade.js`) | 30 min | **sim**, desde 25/08/2026 |
| JWT (`JWT_EXPIRES_IN`) | 7 dias | sim — é o relógio real |
| Dispositivo confiável | nunca expira | — (não mantém logado; só dispensa o código) |

⚠️ **O corte de 30 min passou a valer fechado.** Antes era um `setTimeout` em
memória, que morria junto com a aba: quem fechava o navegador e voltava dias
depois entrava direto, porque o timer nunca chegou a disparar. Hoje o instante
da última atividade vive em `localStorage` (`tg_ultima_atividade`) e é conferido
no carregamento e no `visibilitychange`.

⚠️ **Carrega nas TRÊS telas com sessão** — admin, painel do cliente e
orçamentos. A última faltava, e o síndico era cortado no painel enquanto ficava
logado indefinidamente na tela ao lado, com a mesma sessão.

⚠️ **Na tela de orçamentos o corte abre o cartão de entrada**, não redireciona.
Quem chega ali veio de um link sobre UM documento; trocar a página por um
formulário perde o documento e a URL com `?orc=N`. A página declara isso em
`window.aoExpirarInatividade`; sem declaração, o padrão é `/login?motivo=inatividade`.

⚠️ **É conveniência, não barreira.** O JWT continua válido no servidor pelos 7
dias — apagar o token do navegador não o invalida do outro lado. Serve para o
aparelho compartilhado (a máquina da portaria), não contra quem já copiou o
token. Encerrar sessão de verdade exigiria revogação no backend, que não existe.

## Roles e redirecionamento

- `admin` / `gerente` / `operador` → `/admin/painel`
- `tecnico` → `/tecnico/painel` (app)
- `cliente` → `/cliente/painel`

`redirectByRole` no `login.js` faz o roteamento pós-login, a partir do mapa
explícito `PAINEL_POR_ROLE`. **Não existe destino padrão**: role fora do mapa
não redireciona — o login é abortado (`_abortarLogin`, limpa `token`/`user`) e a
tela mostra *"Seu usuário não tem um painel liberado (perfil: X)"*.

Antes de 30/07/2026 havia um `else` que mandava toda role não mapeada pro
painel do cliente. Era o que transformava um cadastro errado num loop
login → painel → 403 → login, sem mensagem.

O mesmo ponto barra `cliente` sem `condominio_id` (o campo vem no payload de
`/auth/login`), avisando *"não está vinculado a nenhum condomínio"* em vez de
deixar a pessoa entrar pra tomar 403 na primeira request.

> As mensagens **não** dizem "usuário não encontrado": o usuário existe e a
> senha conferiu. O problema é o cadastro, não a credencial — mandar a pessoa
> resetar a senha só faria perder tempo.

> `admin_viewer` ainda é aceito pelo CHECK de `usuarios.role` (migration 049),
> mas **não existe mais em `src/`**: quem tiver essa role loga e toma 403 em
> todo o painel. Sobrevive só como label "Visualizador" no `admin.js`. Hoje o
> `redirectByRole` a barra no login com mensagem explícita.

## Gestão de sessão e dispositivos

- `GET /auth/me` — dados do usuário logado.
- `POST /auth/trocar-senha` — troca de senha autenticada.
- `GET /auth/dispositivos` · `DELETE /auth/dispositivos/:id` · `DELETE
  /auth/dispositivos` — lista/revoga trusted devices.
- `POST /auth/registrar` (masterAdmin) — cadastro de novos usuários.

## Regras de acesso (middleware)

| Middleware | Quem passa | Para quê |
|---|---|---|
| `authRequired` | qualquer JWT válido | — |
| `adminOnly` | `admin`, `gerente`, `operador` | entrar no painel, monitorar, chamados, orçamentos, O.S. |
| `gestaoOnly` | `admin`, `gerente` | operação do negócio (planos, contratos, cadastro de cliente) |
| `masterAdminOnly` | só `admin` | irreversível/sensível (ver abaixo) |
| `clienteOnly` | `cliente`, escopo do próprio `condominio_id` | **async** — também valida que o condomínio está `ativo` a cada request (ver abaixo) |

### Os três níveis do painel

`gestaoOnly` existe porque `adminOnly` **também deixa o operador passar** —
usar `adminOnly` para "liberar pro gerente" liberaria pro operador junto.

O que fica **só no `admin` master** é o que dá dor de cabeça se for feito por
engano:

- **Reservatórios** — criar, editar, excluir, regenerar device-key.
- **Excluir condomínio** — `DELETE /condominios/:id` e `/:id/hard`.
  (Criar e editar são `gestaoOnly` — rotina comercial.)
- **Usuários** — criar, editar, excluir, reset de senha, dispositivos;
  `POST /auth/registrar`. É a fronteira: **credencial de login é do master**.
- **Configurações**, **SLA**, **integrações** e os **jobs de manutenção**.

O que o **gerente** faz junto com o master: orçamentos, ordens de serviço,
planos de manutenção, contratos (inclusive `enviar-assinatura`), cadastro e
edição de cliente, **cadastro/edição/exclusão de técnico**, export de conversas
do WhatsApp, chamados e fechar alerta.

> ⚠️ `DELETE /tecnicos/:id` é **hard delete** (`DELETE FROM tecnicos`), sem
> soft-delete e sem checar vínculos. O banco protege o histórico: chamados,
> O.S. e zonas têm `ON DELETE SET NULL` (o registro fica, perde o técnico), mas
> `tecnico_localizacoes` e o histórico de GPS são `ON DELETE CASCADE` — **o
> rastro de localização some junto**. Liberado ao gerente por decisão de
> 29/07/2026.

> O role `master_admin` foi removido — `masterAdminOnly` hoje equivale a `admin`.

## 401 ≠ 403 no front (pegadinha do "volta pro login sozinho")

**Só 401 pode deslogar.** 401 é sessão ausente/expirada; 403 é o usuário
autenticado sem permissão pra aquela rota. Tratar os dois igual produz um loop
silencioso: o painel abre, a primeira chamada leva 403, o front manda pro
`/login`, o login autentica e o `redirectByRole` devolve pro mesmo painel.
Nenhuma mensagem aparece na tela — só o vai-e-volta.

Foi exatamente o bug de 30/07/2026 no painel do cliente (`cliente.js` mandava
401 **e** 403 pro login). Hoje o padrão é: 401 → limpa o `token` e vai pra
`/login?motivo=expirado`; 403 → mostra o `error` do backend na tela.

**Os dois 403 que o cliente pode tomar** (ambos em `/cliente/*`):

| Mensagem | Origem | Como resolver |
|---|---|---|
| `Acesso restrito (cliente)` | `clienteOnly` — `role` do JWT não é `cliente` | role errada no cadastro; ver a nota do `admin_viewer` acima |
| `Cliente sem condomínio vinculado` | guard de `condominio_id` em `cliente.routes.js` | preencher `usuarios.condominio_id` — o JWT carrega esse campo, então **exige novo login** pra valer |

> Como o `condominio_id` vai **dentro do JWT** (emitido em `/auth/login` e
> `/auth/verify-otp`), vincular o condomínio no banco não conserta a sessão já
> aberta. O usuário precisa deslogar e logar de novo.

### De onde vinham os órfãos

`usuarios.condominio_id` é `ON DELETE SET NULL`. Até 30/07/2026, excluir um
condomínio (mesmo o **hard delete**) deixava o login intacto e sem vínculo —
credencial válida, painel 403, e nada no cadastro de condomínios denunciando
que ela existia.

Hoje `DELETE /condominios/:id/hard` apaga os `role = 'cliente'` do condomínio
**antes** de apagar o condomínio (`condominios.routes.js`, etapa 8). A ordem é
obrigatória: depois do `SET NULL` não há mais como identificar quem era de lá.
`login_codes` e `trusted_devices` saem por CASCADE, então os dispositivos
confiáveis também são revogados.

O **soft delete** (`DELETE /condominios/:id`, `ativo = false`) **revoga o
acesso** desde 30/07/2026. A regra vive em três pontos, e os três são
necessários:

| Onde | Quando roda | Por que precisa existir |
|---|---|---|
| `clienteOnly` | toda request `/cliente/*` | o JWT vale 7 dias — sem isso, quem já estava logado manteria acesso por até uma semana |
| `POST /auth/login` | antes de emitir sessão **e antes do atalho de dispositivo confiável** | trusted device pula o OTP e vai direto ao JWT; a checagem tem que vir antes ou não vale nada. Evita também mandar OTP pra quem não vai entrar |
| `POST /auth/verify-otp` | ao trocar o código pelo JWT | o condomínio pode ser encerrado nos 15 min de validade do `otp_token` |

Vale tanto pro soft delete quanto pra um JWT que aponta pra condomínio já
apagado — nos dois casos a resposta é `MSG_INATIVO` (exportada por
`middleware/clienteOnly.js`).

Reativar (`PATCH /condominios/:id {ativo:true}`, botão "Reativar" no painel)
devolve o acesso automaticamente.

> Reativar o condomínio **não reativa os reservatórios** — o soft delete
> desativa os dois, o `PATCH` só mexe no condomínio. O cliente volta a entrar e
> vê o painel vazio até alguém reativar os reservatórios.

> ⚠️ A restrição do **operador** (`admin.js`, `_isOperador`) é **só de UI**:
> esconde itens do menu com `display:none`, mas no backend ele passa em
> `adminOnly` como qualquer admin. Chamando a API direto, o operador alcança
> orçamentos, O.S. e relatórios. Para valer de verdade, essas rotas
> precisariam de `gestaoOnly`.

---

## A tela de login (`public/login.html` + `login.css` + `login.js`)

### Ela segue o mundo da landing, não o do painel

`/login` é a **costura** entre a landing pública e o painel interno. Desde
2026-08-13 ela usa o sistema visual **"Chapa"** — mesma paleta marinho +
`#fbb329`, mesmo chanfro de 45°, mesmas fontes (Archivo + Martian Mono) —, em
layout **split screen**: campo marinho com a marca à esquerda, placa clara com
o formulário à direita.

⚠️ **Não trazer o âmbar `#f0b014` do `admin.css` para cá.** Ele é a
interpretação do painel interno; a cor institucional é `#fbb329`
(ver [`../../PRODUCT.md`](../../PRODUCT.md)). Quem chega vindo do site não pode
sentir que trocou de empresa no meio do caminho — foi exatamente esse degrau
que motivou o redesenho.

⚠️ **`login.css` duplica os tokens da landing de propósito.** As duas páginas
não compartilham CSS (`landing.css` só é servido em `/`), então a paleta, o
chanfro e as `@font-face` estão copiados. **Ao mudar a paleta, mudar nos dois.**

### ⚠️ Nunca ampliar a foto para cortar na lateral

`public/fotos/reservatorios.jpg` é a **única foto do acervo que mostra
reservatório** (as outras são bomba, quadro ou barrilete) e a única em retrato
(960×1280). Por isso ela é a imagem desta tela.

A divisão é `1.12fr / .88fr` — o painel da foto é o maior, porque a placa do
formulário fecha em 440px e não precisa de mais espaço. Nesse painel, mais
largo do que a foto é alta, o `cover` **corta ~30% na vertical**. Isso é
desejado: a marca do **fabricante do tanque, com dois telefones legíveis**,
está no TOPO da foto, então `background-position: 50% 90%` (alinhado pela base)
faz o recorte cair exatamente em cima dela. **O enquadramento resolve sozinho
— não há sombra local nem zoom.**

⚠️ **Foi tentando resolver isso de outro jeito que duas versões deram errado.**
Cortar a marca do fabricante *pela lateral* exigia ampliar a imagem; somado ao
recorte vertical que o `cover` já fazia, sobrava menos da metade da foto e ela
virava close, sem os tanques nem o corredor — que são o motivo de ela ter sido
escolhida. Regra: **o recorte é vertical, a escala é `cover`, e ponto.**

Ao mexer no `90%`: conferir a foto ampliada. Os telefones voltam fácil e a 100%
de zoom eles enganam.

O texto do painel fica **no rodapé**, à esquerda, e o véu fecha forte no pé
(`.90` em 84%, `.97` no fim) — as duas coisas são preferência declarada do
Pedro. Uma versão intermediária levou o texto ao topo e outra clareou o pé para
`.68`/`.78`; **as duas foram recusadas**, ele gosta do desbotamento no rodapé.

⚠️ **O que equilibra isso é o `padding-bottom` do `.marca-lado`**, que é maior
que as outras margens (`clamp(80px, 14vh, 130px)` contra 56px). Ele descola o
bloco da borda e o tira de dentro do trecho mais fechado do véu: o texto fecha
a ~86% da altura, não a ~93%. Sem essa folga o bloco fica deitado na parte
preta e os dois técnicos ficam partidos ao meio pela frase.

Se mexer no véu ou no `padding-bottom`, mexer nos dois juntos — um existe por
causa do outro. No mobile o `padding` é redefinido pela media query e esse
ajuste não se aplica.

⚠️ **No mobile `cover` não serve, e aí a ampliação é obrigatória.** A faixa é
larga e baixa e a foto é retrato: `cover` escala pela largura, a sobra é toda
vertical e o `background-position-x` não faz efeito nenhum — o extintor da
borda direita entra sempre. Por isso lá o valor é `112%`, o mínimo para existir
sobra horizontal. É a única exceção à regra acima.

### ⚠️ Os passos são alternados por `hidden`, nunca por `style.display`

`login.js` alternava `loginForm.style.display` entre `"none"` e `"block"`. O
`"block"` inline sobrescrevia o `display` do CSS, e o formulário voltava do
passo do código como bloco simples — sem o espaçamento entre os campos. Hoje
existe `_irPara("email" | "senha" | "otp")`, que mexe só no atributo `hidden`, e
o CSS tem `[hidden] { display: none !important }`. Não voltar a `style.display`.

⚠️ **`required` acompanha a visibilidade**, nos dois campos. `required` num
campo escondido trava o submit sem dizer o porquê: o navegador tenta focar um
elemento que não está na tela e o clique no botão simplesmente não faz nada. É
por isso que `#senha` nasce sem `required` no HTML — quem liga é o `_irPara`.

⚠️ **Um travamento de botão por vez.** `_perguntarMetodo` chama `_pedirCodigo`
dentro do próprio `try`, e os dois travam o mesmo `#loginBtn`. `_travar` só
guarda o rótulo original no **primeiro** travamento; senão o de dentro guardaria
"Verificando…" como rótulo de repouso e o botão voltaria de um erro escrito
assim.

### ⚠️ Anel de foco em elemento chanfrado tem de ser `inset`

Mesma armadilha da landing: `clip-path` recorta tudo que o elemento pinta,
inclusive `outline` e `box-shadow` normal, que ficam fora da caixa. Em campo e
botão chanfrado o indicador de foco é `box-shadow: inset` — **os dois anéis**.
Elemento focável novo com chanfro precisa entrar na lista de `:focus-visible`
no topo do `login.css`.

### Cache

A tela de login **registra o service worker** (`register-sw.js`), diferente da
landing. Então `login.css`/`login.js` entram no cache do SW: ao alterá-los,
bumpe o `?v=N` dos dois **e** o `CACHE_NAME` do `public/sw.js` **e** o `?v=N`
do `register-sw.js`. Ver [`../../CLAUDE.md`](../../CLAUDE.md).
