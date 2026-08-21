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
  operador: "/admin/painel",
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

// ⚠️ Os dois passos são alternados pelo atributo `hidden`, NUNCA por
// `style.display`. O inline `display:block` que existia aqui sobrescrevia o
// display do CSS: o formulário voltava do passo do código como bloco simples e
// perdia o espaçamento entre os campos. `hidden` deixa o layout com o CSS.
function _mostrarPasso(qual) {
  loginForm.hidden = qual !== "login";
  otpStep.hidden   = qual !== "otp";
}

// Descarta a sessão e volta pro passo 1 com o motivo na tela.
function _abortarLogin(msg) {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  _mostrarPasso("login");
  _otpToken = null;
  showError(msg);
}

// --- Passo 1: email + senha ---
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();

  const email = document.getElementById("email").value;
  const senha = document.getElementById("senha").value;

  try {
    const res  = await fetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, senha }),
    });
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || "Erro ao fazer login");
      return;
    }

    // 2FA desativado (OTP_DISABLED=true no servidor)
    if (data.token) {
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      redirectByRole(data.user);
      return;
    }

    // Aguarda verificação de código
    if (data.pending) {
      _otpToken = data.otp_token;
      _mostrarPasso("otp");
      otpCode.value = "";
      otpCode.focus();
    }
  } catch {
    showError("Erro de conexão com servidor");
  }
});

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

// Voltar para tela de login
otpBack.addEventListener("click", () => {
  clearError();
  _otpToken = null;
  _mostrarPasso("login");
});
