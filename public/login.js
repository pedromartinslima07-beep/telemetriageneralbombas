let _otpToken = null;

// Aviso de sessão expirada por inatividade
if (new URLSearchParams(location.search).get("motivo") === "inatividade") {
  document.addEventListener("DOMContentLoaded", () => {
    const el = document.getElementById("erroMsg");
    if (el) {
      el.textContent = "Sua sessão expirou por inatividade. Faça login novamente.";
      el.classList.add("visible");
    }
  });
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

function redirectByRole(role) {
  if (role === "admin" || role === "admin_viewer") {
    window.location.href = "/admin/painel";
  } else {
    window.location.href = "/cliente/painel";
  }
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
      redirectByRole(data.user.role);
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
    redirectByRole(data.user.role);
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
