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

- `admin` / `admin_viewer` → `/admin/painel`
- `tecnico` → `/tecnico/painel` (app)
- `cliente` → `/cliente/painel`

`redirectByRole` no `login.js` faz o roteamento pós-login.

## Gestão de sessão e dispositivos

- `GET /auth/me` — dados do usuário logado.
- `POST /auth/trocar-senha` — troca de senha autenticada.
- `GET /auth/dispositivos` · `DELETE /auth/dispositivos/:id` · `DELETE
  /auth/dispositivos` — lista/revoga trusted devices.
- `POST /auth/registrar` (masterAdmin) — cadastro de novos usuários.

## Regras de acesso (middleware)

| Middleware | Quem passa |
|---|---|
| `authRequired` | qualquer JWT válido |
| `adminOnly` | `admin`, `admin_viewer` (leitura) |
| `masterAdminOnly` | só `admin` (escrita sensível) |
| `clienteOnly` | `cliente`, escopo do próprio `condominio_id` |

> O role `master_admin` foi removido — `masterAdminOnly` hoje equivale a `admin`.
