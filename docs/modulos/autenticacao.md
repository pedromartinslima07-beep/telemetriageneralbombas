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

`redirectByRole` no `login.js` faz o roteamento pós-login.

> `admin_viewer` ainda é aceito pelo CHECK de `usuarios.role` (migration 049),
> mas **não existe mais em `src/`**: quem tiver essa role loga e toma 403 em
> todo o painel. Sobrevive só como label "Visualizador" no `admin.js`.

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
| `clienteOnly` | `cliente`, escopo do próprio `condominio_id` | — |

### Os três níveis do painel

`gestaoOnly` existe porque `adminOnly` **também deixa o operador passar** —
usar `adminOnly` para "liberar pro gerente" liberaria pro operador junto.

O que fica **só no `admin` master** é o que dá dor de cabeça se for feito por
engano:

- **Reservatórios** — criar, editar, excluir, regenerar device-key.
- **Excluir condomínio** — `DELETE /condominios/:id` e `/:id/hard`.
  (Criar e editar são `gestaoOnly` — rotina comercial.)
- **Usuários** — criar, editar, excluir, reset de senha, dispositivos;
  `POST /auth/registrar`.
- **Técnicos** — criar, editar, excluir.
- **Configurações**, **SLA**, **integrações** e os **jobs de manutenção**.

O que o **gerente** faz junto com o master: orçamentos, ordens de serviço,
planos de manutenção, contratos (inclusive `enviar-assinatura`), cadastro e
edição de cliente, export de conversas do WhatsApp, chamados e fechar alerta.

> O role `master_admin` foi removido — `masterAdminOnly` hoje equivale a `admin`.

> ⚠️ A restrição do **operador** (`admin.js`, `_isOperador`) é **só de UI**:
> esconde itens do menu com `display:none`, mas no backend ele passa em
> `adminOnly` como qualquer admin. Chamando a API direto, o operador alcança
> orçamentos, O.S. e relatórios. Para valer de verdade, essas rotas
> precisariam de `gestaoOnly`.
