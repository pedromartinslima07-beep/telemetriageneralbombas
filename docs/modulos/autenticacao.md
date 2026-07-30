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

## Passo a passo

1. **`POST /auth/login`** (`loginLimiter`) — recebe `email` + `senha`.
   - Valida senha com bcrypt contra `usuarios.senha_hash`.
   - Se o request traz cookie de **trusted device** válido (`trusted_devices`,
     não expirado), pode pular o OTP e emitir o JWT direto.
   - Caso contrário, gera OTP de 6 dígitos em `login_codes` (expira em 10 min) e
     envia por email via **Resend** (`email.js`).
   - Em dev, `OTP_DISABLED=true` (lido com `.trim()`) desativa o 2FA.

2. **`POST /auth/verify-otp`** (`otpLimiter`) — recebe o código.
   - Valida contra `login_codes` (não usado, não expirado), marca `used`.
   - Emite **JWT** (7 dias, assinado com `JWT_SECRET`) com `id`, `role`,
     `condominio_id`.
   - Se o usuário pediu "lembrar deste dispositivo", grava `trusted_devices`
     (token aleatório) e seta cookie httpOnly + SameSite (30 dias).

3. Cliente guarda o JWT (localStorage) e o envia em `Authorization: Bearer`.

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
