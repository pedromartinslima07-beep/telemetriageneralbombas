let _otpToken = null;

// Aviso de sessão expirada (inatividade ou token expirado/inválido)
{
  const _motivo = new URLSearchParams(location.search).get("motivo");
  const _msgsMotivo = {
    inatividade: "Sua sessão expirou por inatividade. Faça login novamente.",
    expirado: "Sua sessão expirou. Faça login novamente.",
  };
  if (_msgsMotivo[_motivo]) {
    document.addEventListener("DOMContentLoaded", () => {
      const el = document.getElementById("erroMsg");
      if (el) {
        el.textContent = _msgsMotivo[_motivo];
        el.classList.add("visible");
      }
    });
  }
}

const loginForm  = document.getElementById("loginForm");
const otpStep    = document.getElementById("otpStep");
const otpCode    = document.getElementById("otpCode");
const otpConfiar = document.getElementById("otpConfiar");
const otpBtn     = document.getElementById("otpBtn");
const otpBack    = document.getElementById("otpBack");
const erroMsg    = document.getElementById("erroMsg");

function showError(msg) {
  erroMsg.textContent = msg;
  erroMsg.classList.add("visible");
}

function clearError() {
  erroMsg.textContent = "";
  erroMsg.classList.remove("visible");
}

// Mapa explícito role → painel. O `else` que existia aqui era catch-all pro
// painel do cliente: qualquer role sem painel próprio (ex.: `admin_viewer`,
// morta no backend mas ainda aceita no CHECK do banco) era mandada pra
// /cliente/painel, tomava 403 do `clienteOnly` e voltava pro login — loop sem
// mensagem. Role desconhecida agora para aqui, com aviso.
const PAINEL_POR_ROLE = {
  admin:    "/admin/painel",
  gerente:  "/admin/painel",
  // O operador tem superfície própria desde 27/08/2026 — não é mais o painel
  // admin com itens escondidos. Ver docs/modulos/painel-operador.md.
  operador: "/operador/painel",
  tecnico:  "/tecnico/painel",
  cliente:  "/cliente/painel",
};

// Destino pedido pela página que mandou pro login (`/login?next=/e/AB7K2M9X`).
// Nasceu da etiqueta QR: sem isso o técnico escaneia a bomba, cai no login,
// entra — e vai parar no painel, tendo que escanear de novo.
//
// Allowlist estreita em vez de "qualquer path que comece com /": um `next`
// livre é open redirect (`//evil.com` é path válido pro navegador e sai do
// domínio). Só entram aqui os destinos que de fato precisam voltar — e cada
// um declara de quem ele é, porque mandar alguém para uma tela que vai lhe
// dar 403 é pior que ignorar o `next`.
const NEXT_PERMITIDO = [
  // ficha do equipamento (etiqueta QR na bomba): fechada pro cliente
  { padrao: /^\/e\/[0-9A-Za-z-]{1,20}$/, cliente: false },
  // orçamento: o link do e-mail, e o dono dele é justamente o síndico
  { padrao: /^\/cliente\/painel\/orcamentos(\?orc=[0-9]{1,9})?$/, cliente: true },
];

// Devolve { destino, cliente } ou null. O `cliente` viaja junto porque quem
// decide se o `next` vale é o role, e o role só se conhece depois do POST.
function destinoNext() {
  try {
    const next = new URLSearchParams(window.location.search).get("next");
    if (!next) return null;
    const regra = NEXT_PERMITIDO.find(r => r.padrao.test(next));
    return regra ? { destino: next, cliente: regra.cliente } : null;
  } catch (_) {
    return null;
  }
}

/* ── Quem já tem sessão não vê esta tela ────────────────────────────────
   ⚠️ O PWA INSTALADO ABRE AQUI (01/09/2026). O `start_url` do manifest é
   lido UMA vez, na instalação, e até 31/08/2026 ele era `/login` para todo
   mundo (hoje o `src/app.js` gera um por app via `?app=`). Quem instalou o
   ícone antes disso continua caindo neste arquivo toda vez que abre o app —
   e no iOS nem o manifest novo resolve, porque lá o `start_url` é ignorado
   em favor da página que estava aberta na hora de instalar.

   Sem este bloco o sintoma é "o PWA me desloga ao fechar", e não é isso: o
   token está no `localStorage`, vivo, e ninguém olha para ele. A tela pinta
   o formulário por cima de uma sessão válida.

   ⚠️ AS DUAS GUARDAS EXISTEM CONTRA LOOP, não por precaução genérica. Sem
   elas o caminho é: login manda pro painel → painel pede dado → 401 → painel
   manda pro login → login manda pro painel, para sempre.

     1. `motivo` na URL — alguém acabou de ser mandado para cá de propósito
        (`?motivo=expirado` do 401, `?motivo=inatividade` do corte). Quem
        chega assim vê o formulário e a mensagem, nunca um redirect.
     2. `exp` do próprio JWT — token vencido não vai a lugar nenhum. É a
        mesma leitura que o `inatividade.js` faz do `iat`.

   ⚠️ O CARIMBO DE INATIVIDADE NÃO É CONFERIDO AQUI, e é decisão: repetir os
   30 minutos e a chave `tg_ultima_atividade` neste arquivo cria uma segunda
   cópia da regra para alguém esquecer de mudar junto. Quem volta com o tempo
   estourado é redirecionado, o `inatividade.js` do painel corta antes de
   pintar dado e devolve para cá com `?motivo=inatividade` — a mensagem certa,
   ao custo de um flash. A guarda 1 impede que isso vire ida e volta.

   `location.replace` e não `href`: com `href` o botão "voltar" cai no /login,
   que redireciona de novo — o histórico vira uma parede. */
function _sessaoValida() {
  try {
    const partes = (localStorage.getItem("token") || "").split(".");
    if (partes.length !== 3) return null; // token do harness / storage vazio
    // base64url → base64, igual ao `nascimentoDaSessao` do inatividade.js.
    const p = JSON.parse(atob(partes[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (!Number.isFinite(p.exp) || p.exp * 1000 <= Date.now()) return null;
    return p;
  } catch (_) {
    return null; // payload que não é JSON, storage bloqueado, modo privado
  }
}

{
  const _motivo = new URLSearchParams(location.search).get("motivo");
  const _sessao = _motivo ? null : _sessaoValida();
  const _role = _sessao?.role;
  // Cliente sem condomínio no token levaria 403 no painel e voltaria para cá —
  // mesma barreira que o `redirectByRole` aplica depois do login.
  const _servivel = _role !== "cliente" || !!_sessao?.condominio_id;
  const _destino = _servivel ? PAINEL_POR_ROLE[_role] : null;
  if (_destino) {
    const _next = destinoNext();
    const _vale = _next && (_role !== "cliente" || _next.cliente);
    location.replace(_vale ? _next.destino : _destino);
  }
}

// Não redireciona se o login não tem como dar certo do outro lado. A senha
// estava certa — o problema é o cadastro —, então a mensagem diz isso em vez
// de fingir que a credencial falhou.
function redirectByRole(user) {
  const role = user?.role;
  const destino = PAINEL_POR_ROLE[role];

  if (!destino) {
    _abortarLogin(
      `Seu usuário não tem um painel liberado (perfil: ${role || "indefinido"}). ` +
      `Fale com o administrador.`
    );
    return;
  }

  // Cliente sem condomínio vinculado passa no login mas leva 403 em todo
  // /cliente/* ("Cliente sem condomínio vinculado"). O condominio_id vem
  // dentro do JWT, então dá pra barrar aqui e explicar.
  if (role === "cliente" && !user.condominio_id) {
    _abortarLogin(
      "Seu usuário não está vinculado a nenhum condomínio. " +
      "Fale com o administrador para liberar o acesso."
    );
    return;
  }

  // Cada destino diz se serve pro cliente. A ficha do equipamento não serve
  // (403 do `equipeInterna`) — mandá-lo pra lá seria trocar o painel dele por
  // uma tela de erro. A tela de orçamentos serve, e é o caminho do link que
  // chega no e-mail do síndico.
  const next = destinoNext();
  const vale = next && (role !== "cliente" || next.cliente);
  window.location.href = vale ? next.destino : destino;
}

// Descarta a sessão e volta pro passo 1 com o motivo na tela.
function _abortarLogin(msg) {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  _otpToken = null;
  _irPara("email");
  showError(msg);
}

/* ── O e-mail primeiro, o resto depois ──────────────────────────────────
   ⚠️ A TELA NÃO PERGUNTA MAIS QUEM É VOCÊ (25/08/2026). Até aqui havia um
   botão "Sou do condomínio — entrar sem senha" alternando dois modos na mesma
   placa: a pessoa tinha de se classificar antes de digitar qualquer coisa, e
   o que ela estava classificando era a NOSSA modelagem de dados. O `role` já
   decide o caminho; o `/auth/metodo` responde isso a partir do e-mail.

   São três passos, nunca dois modos:
     email  → pergunta só o e-mail e ao servidor qual campo vem depois
     senha  → equipe interna (`role` != cliente)
     otp    → o código de 6 dígitos, comum aos dois caminhos

   ⚠️ O CLIENTE NÃO TEM SENHA. Quem cria o acesso do síndico é o escritório,
   no admin, com o e-mail dele; daí em diante o e-mail é a credencial e o
   código é a prova. Em produção o código já era exigido em TODO login
   (`if (!isProd && OTP_DISABLED)` em auth.routes.js), então a senha nunca foi
   o que protegia essa conta — era só mais uma coisa para ele esquecer, sem
   recuperação nenhuma. A equipe interna continua com senha: essa gente entra
   todo dia, e um código por login seria pedágio.

   ⚠️ E-mail desconhecido responde `codigo`, e segue para o passo do código
   como qualquer cliente. Não é descuido: "esse e-mail não existe" na tela de
   login transforma a porta num verificador de quem tem conta. O código
   simplesmente nunca chega. Ver a nota no `/auth/metodo`. */
let _passo = "email";
let _passoDoCodigo = "email"; // de onde o OTP veio, pra onde o "Voltar" leva
// O e-mail que o `/auth/metodo` confirmou. Os passos seguintes usam ESTE, não
// o valor do campo: o campo fica escondido a partir do passo 2, e ler dele de
// novo seria confiar que ninguém mexeu no meio — a tela diria "Entrando como
// fulano" enquanto mandaria outro para o servidor.
let _emailConfirmado = "";

// Não é validação de verdade — e-mail só se valida entregando — mas separa
// "isto é um endereço" de "isto é uma palavra". Aqui o `<form>` não tem
// `novalidate` e o campo é `type="email" required`, então o navegador já
// barra; esta checagem é o cinto que sobrevive a alguém pôr `novalidate` no
// form um dia. Na tela de orçamentos, que TEM `novalidate`, a falta dela fez a
// tela anunciar "Enviamos um código de 6 dígitos para comer".
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const campoEmail  = document.getElementById("campoEmail");
const campoSenha  = document.getElementById("campoSenha");
const emailInput  = document.getElementById("email");
const senhaInput  = document.getElementById("senha");
const loginBtn    = document.getElementById("loginBtn");
const placaSub    = document.getElementById("placaSub");
const identidade  = document.getElementById("identidade");
const identidadeEmail = document.getElementById("identidadeEmail");
const btnTrocar   = document.getElementById("btnTrocar");

// ⚠️ Os passos são alternados pelo atributo `hidden`, NUNCA por
// `style.display`. O inline `display:block` que existia aqui sobrescrevia o
// display do CSS: o formulário voltava do passo do código como bloco simples e
// perdia o espaçamento entre os campos. `hidden` deixa o layout com o CSS.
//
// ⚠️ `required` acompanha a visibilidade nos DOIS campos. `required` num campo
// escondido trava o submit sem mostrar o porquê — o navegador tenta focar um
// elemento que não está lá e o clique no botão simplesmente não faz nada.
function _irPara(passo) {
  _passo = passo;
  const noEmail = passo === "email";

  loginForm.hidden = passo === "otp";
  otpStep.hidden   = passo !== "otp";

  campoEmail.hidden   = !noEmail;
  emailInput.required = noEmail;
  campoSenha.hidden   = passo !== "senha";
  senhaInput.required = passo === "senha";

  // A identidade toma o lugar do subtítulo: depois que o e-mail está dado, a
  // instrução genérica não tem mais o que instruir.
  identidade.hidden = noEmail;
  placaSub.hidden   = !noEmail;

  loginBtn.textContent = noEmail ? "Continuar" : "Entrar";
  loginBtn.disabled = false;
  // O passo mandou no rótulo: um `_destravar` que ainda esteja na pilha não
  // pode restaurar por cima dele o rótulo do passo anterior.
  delete loginBtn.dataset.rotulo;

  if (noEmail) senhaInput.value = "";
}

// ⚠️ `_perguntarMetodo` chama `_pedirCodigo` dentro do próprio try: os dois
// travam o mesmo botão, um por cima do outro. Por isso o rótulo original só é
// guardado no PRIMEIRO travamento — senão o de dentro guardaria "Verificando…"
// como se fosse o rótulo de repouso, e o botão voltaria de um erro escrito
// assim.
function _travar(btn, texto) {
  if (!btn.disabled) btn.dataset.rotulo = btn.textContent;
  btn.disabled = true;
  btn.textContent = texto;
}

function _destravar(btn) {
  btn.disabled = false;
  if (btn.dataset.rotulo) {
    btn.textContent = btn.dataset.rotulo;
    delete btn.dataset.rotulo;
  }
}

// "trocar": volta pro passo 1 com o e-mail preenchido pra ser corrigido, não
// apagado — quem clica aqui quase sempre errou uma letra.
btnTrocar.addEventListener("click", () => {
  clearError();
  _otpToken = null;
  _irPara("email");
  emailInput.focus();
  emailInput.select();
});

// --- Passo 1: só o e-mail ---
async function _perguntarMetodo(email) {
  _travar(loginBtn, "Verificando…");
  try {
    const res = await fetch("/auth/metodo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || "Não foi possível verificar o e-mail");
      return;
    }

    _emailConfirmado = email;
    identidadeEmail.textContent = email;

    if (data.metodo === "senha") {
      _irPara("senha");
      senhaInput.focus();
      return;
    }

    // Cliente (ou e-mail desconhecido): o código é a credencial, então não há
    // segundo campo para preencher — pede o código já, sem um clique a mais.
    await _pedirCodigo(email, "email");
  } catch {
    showError("Erro de conexão com servidor");
  } finally {
    _destravar(loginBtn);
  }
}

// Dispara o `/auth/codigo` e entra no passo do OTP. `origem` é para onde o
// botão "Voltar" do passo do código leva de volta.
async function _pedirCodigo(email, origem) {
  _travar(loginBtn, "Enviando código…");
  try {
    const res = await fetch("/auth/codigo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();

    if (!res.ok) {
      // Condomínio encerrado responde 403 aqui, com o motivo.
      showError(data.error || "Não foi possível enviar o código");
      return;
    }

    if (_entrarSeVeioToken(data)) return;

    if (data.pending) {
      _otpToken = data.otp_token;
      _passoDoCodigo = origem;
      _irPara("otp");
      otpCode.value = "";
      otpCode.focus();
    }
  } finally {
    _destravar(loginBtn);
  }
}

// --- Passo 2a: a senha da equipe interna ---
async function _entrarComSenha(email, senha) {
  _travar(loginBtn, "Entrando…");
  try {
    const res = await fetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, senha }),
    });
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || "Erro ao fazer login");
      return;
    }

    if (_entrarSeVeioToken(data)) return;

    // O `/auth/login` mandou o código de 6 dígitos (2FA da equipe).
    if (data.pending) {
      _otpToken = data.otp_token;
      _passoDoCodigo = "senha";
      _irPara("otp");
      otpCode.value = "";
      otpCode.focus();
    }
  } catch {
    showError("Erro de conexão com servidor");
  } finally {
    _destravar(loginBtn);
  }
}

// Sessão pronta sem passar pelo código: dispositivo confiável, ou
// OTP_DISABLED=true no servidor (só dev).
function _entrarSeVeioToken(data) {
  if (!data.token) return false;
  localStorage.setItem("token", data.token);
  localStorage.setItem("user", JSON.stringify(data.user));
  redirectByRole(data.user);
  return true;
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();

  const email = emailInput.value.trim();

  if (_passo === "email") {
    if (!email) return;
    if (!RE_EMAIL.test(email)) {
      showError("Isso não parece um e-mail. Confira e tente de novo.");
      emailInput.focus();
      return;
    }
    await _perguntarMetodo(email);
    return;
  }

  await _entrarComSenha(_emailConfirmado, senhaInput.value);
});

_irPara("email");

// `/login?email=alguem@predio.com` — o link que sai nos nossos e-mails já
// sabe de quem é a caixa. Preenche e deixa o foco no botão: passar direto
// para o passo seguinte faria um GET disparar e-mail de código, o que é
// spam esperando alguém descobrir.
{
  const _pre = new URLSearchParams(location.search).get("email");
  if (_pre && RE_EMAIL.test(_pre)) {
    emailInput.value = _pre;
    document.addEventListener("DOMContentLoaded", () => loginBtn.focus());
  }
}

// --- Passo 2: código OTP ---
otpBtn.addEventListener("click", async () => {
  clearError();
  const code = otpCode.value.trim();

  if (code.length !== 6) {
    showError("Digite os 6 dígitos do código");
    return;
  }

  try {
    const res  = await fetch("/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otp_token: _otpToken, code, confiar: otpConfiar.checked }),
    });
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || "Código inválido");
      return;
    }

    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    redirectByRole(data.user);
  } catch {
    showError("Erro de conexão com servidor");
  }
});

// Permite confirmar com Enter no campo do código
otpCode.addEventListener("keydown", (e) => {
  if (e.key === "Enter") otpBtn.click();
});

// Voltar para o passo que pediu o código: a senha da equipe, ou o e-mail de
// quem entra só com código. Mandar todo mundo para o começo faria o interno
// redigitar o e-mail que ele acabou de confirmar.
otpBack.addEventListener("click", () => {
  clearError();
  _otpToken = null;
  _irPara(_passoDoCodigo);
  (_passoDoCodigo === "senha" ? senhaInput : emailInput).focus();
});
