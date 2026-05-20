// General Bombas — App mobile (Capacitor)
// Fase 7B: login + OTP + home placeholder. Armazenamento via localStorage
// (será trocado por Capacitor Preferences quando empacotarmos pro Android).

// ============== CONFIG ==============
const API_BASE = (() => {
  const proto = window.location.protocol;
  if (proto === "capacitor:" || proto === "file:") {
    return window.GB_API_BASE || "https://general-bombas.app";
  }
  return window.location.origin;
})();

const IS_CAPACITOR = window.location.protocol === "capacitor:";

// ============== STORAGE ==============
// Wrapper fino: trocar por Capacitor Preferences quando empacotarmos.
const Storage = {
  getToken() { return localStorage.getItem("gb_token") || null; },
  setToken(t) { localStorage.setItem("gb_token", t); },
  clearToken() { localStorage.removeItem("gb_token"); },
  getUser() {
    const s = localStorage.getItem("gb_user");
    return s ? JSON.parse(s) : null;
  },
  setUser(u) { localStorage.setItem("gb_user", JSON.stringify(u)); },
  clearUser() { localStorage.removeItem("gb_user"); },
  clear() { this.clearToken(); this.clearUser(); },
};

// ============== API ==============
// Fetch com Bearer token automático. Em caso de 401, limpa storage e
// volta pra login.
async function api(path, opts = {}) {
  const token = Storage.getToken();
  const headers = {
    "Accept": "application/json",
    ...(opts.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    ...opts.headers,
  };

  const r = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers,
    body: opts.body && typeof opts.body === "object" ? JSON.stringify(opts.body) : opts.body,
  });

  if (r.status === 401 && token) {
    Storage.clear();
    showScreen("login");
    throw new Error("Sessão expirada. Faça login novamente.");
  }

  let data = null;
  try { data = await r.json(); } catch {}

  if (!r.ok) {
    const msg = data?.error || `Erro HTTP ${r.status}`;
    throw new Error(msg);
  }
  return data;
}

// ============== SCREEN ROUTER ==============
function showScreen(name) {
  document.querySelectorAll("[data-screen]").forEach((el) => {
    if (el.dataset.screen === name) {
      el.setAttribute("data-active", "");
    } else {
      el.removeAttribute("data-active");
    }
  });
}

// ============== HELPERS UI ==============
function setBtnLoading(btn, loading) {
  btn.disabled = loading;
  btn.classList.toggle("is-loading", loading);
}

function showAlert(el, msg, type = "error") {
  el.className = `alert ${type}`;
  el.textContent = msg;
  el.hidden = false;
}

function hideAlert(el) {
  el.hidden = true;
}

const ROLE_LABEL = {
  admin: "Admin",
  admin_viewer: "Admin (somente leitura)",
  cliente: "Cliente / Síndico",
  tecnico: "Técnico",
};

// ============== LOGIN ==============
const formLogin = document.getElementById("formLogin");
const loginAlert = document.getElementById("loginAlert");
const loginBtn = document.getElementById("loginBtn");

let otpContext = null; // { otp_token, email }

formLogin.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAlert(loginAlert);

  const email = document.getElementById("loginEmail").value.trim();
  const senha = document.getElementById("loginSenha").value;
  if (!email || !senha) {
    showAlert(loginAlert, "Preencha email e senha.");
    return;
  }

  setBtnLoading(loginBtn, true);
  try {
    const r = await api("/auth/login", {
      method: "POST",
      body: { email, senha },
    });

    if (r.pending && r.otp_token) {
      otpContext = { otp_token: r.otp_token, email };
      document.getElementById("otpEmail").textContent = email;
      document.getElementById("otpCode").value = "";
      hideAlert(document.getElementById("otpAlert"));
      showScreen("otp");
    } else if (r.token && r.user) {
      Storage.setToken(r.token);
      Storage.setUser(r.user);
      mostrarHome(r.user);
    } else {
      throw new Error("Resposta inesperada do servidor.");
    }
  } catch (err) {
    showAlert(loginAlert, err.message);
  } finally {
    setBtnLoading(loginBtn, false);
  }
});

// ============== OTP ==============
const formOtp = document.getElementById("formOtp");
const otpAlert = document.getElementById("otpAlert");
const otpBtn = document.getElementById("otpBtn");
const otpCodeInput = document.getElementById("otpCode");

document.getElementById("otpBack").addEventListener("click", () => {
  otpContext = null;
  showScreen("login");
});

// Mantém só dígitos no input
otpCodeInput.addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/\D+/g, "").slice(0, 6);
});

formOtp.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAlert(otpAlert);

  if (!otpContext) {
    showScreen("login");
    return;
  }

  const code = otpCodeInput.value.trim();
  if (code.length !== 6) {
    showAlert(otpAlert, "Digite os 6 dígitos do código.");
    return;
  }

  const confiar = document.getElementById("otpConfiar").checked;

  setBtnLoading(otpBtn, true);
  try {
    const r = await api("/auth/verify-otp", {
      method: "POST",
      body: { otp_token: otpContext.otp_token, code, confiar },
    });

    Storage.setToken(r.token);
    Storage.setUser(r.user);
    otpContext = null;
    mostrarHome(r.user);
  } catch (err) {
    showAlert(otpAlert, err.message);
  } finally {
    setBtnLoading(otpBtn, false);
  }
});

// ============== HOME ==============
function mostrarHome(user) {
  document.getElementById("homeUserName").textContent = user.nome || "—";
  document.getElementById("homeUserRole").textContent = ROLE_LABEL[user.role] || user.role;
  document.getElementById("homeGreeting").textContent = `Olá, ${(user.nome || "").split(" ")[0] || "!"}`;
  document.getElementById("homeEmail").textContent = user.email || "—";

  const roleEl = document.getElementById("homeRoleBadge");
  roleEl.innerHTML = `<span class="role-badge ${user.role}">${ROLE_LABEL[user.role] || user.role}</span>`;

  if (user.condominio_id) {
    document.getElementById("homeCondoRow").hidden = false;
    document.getElementById("homeCondo").textContent = `#${user.condominio_id}`;
  } else {
    document.getElementById("homeCondoRow").hidden = true;
  }

  showScreen("home");
}

document.getElementById("btnLogout").addEventListener("click", () => {
  Storage.clear();
  document.getElementById("loginSenha").value = "";
  hideAlert(loginAlert);
  showScreen("login");
});

document.getElementById("btnPing").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const alertEl = document.getElementById("homeAlert");
  hideAlert(alertEl);
  setBtnLoading(btn, true);
  try {
    const data = await api("/chamados");
    showAlert(alertEl, `✓ ${Array.isArray(data) ? data.length : "?"} chamados acessíveis com seu papel.`, "success");
  } catch (err) {
    showAlert(alertEl, `✗ ${err.message}`, "error");
  } finally {
    setBtnLoading(btn, false);
  }
});

// Relogio no rodape da home
function atualizarRelogio() {
  const now = new Date();
  const el = document.getElementById("now");
  if (el) el.textContent = `${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR")}`;
}
atualizarRelogio();
setInterval(atualizarRelogio, 1000);

// ============== BOOTSTRAP ==============
// Footer de diagnóstico no login
document.getElementById("apiBase").textContent = API_BASE;
document.getElementById("envInfo").textContent = IS_CAPACITOR ? "Capacitor (nativo)" : "Browser (dev)";

// Se tem token, tenta validar e ir direto pra home
(async () => {
  const token = Storage.getToken();
  if (!token) {
    showScreen("login");
    return;
  }
  try {
    const user = await api("/auth/me");
    Storage.setUser(user);
    mostrarHome(user);
  } catch {
    // 401 já limpou o storage no api()
    showScreen("login");
  }
})();
