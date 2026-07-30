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

  window.location.href = destino;
}

// Descarta a sessão e volta pro passo 1 com o motivo na tela.
function _abortarLogin(msg) {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  otpStep.style.display   = "none";
  loginForm.style.display = "block";
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
      loginForm.style.display = "none";
      otpStep.style.display   = "block";
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
  otpStep.style.display   = "none";
  loginForm.style.display = "block";
});
