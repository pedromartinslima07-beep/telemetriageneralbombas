function getToken() {
  return localStorage.getItem("token");
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: "Bearer " + token } : {};
}

if (!getToken()) {
  window.location.href = "/login";
}

function abrirModalSenha() {
  document.getElementById("senhaMsg").textContent = "";
  document.getElementById("senhaAtual").value = "";
  document.getElementById("senhaNova").value = "";
  document.getElementById("senhaNova2").value = "";
  document.getElementById("senhaOverlay").style.display = "flex";
}

function fecharModalSenha() {
  document.getElementById("senhaOverlay").style.display = "none";
  document.getElementById("senhaMsg").textContent = "";
}

// fecha clicando fora
document.addEventListener("click", (e) => {
  const ov = document.getElementById("senhaOverlay");
  if (ov && ov.style.display !== "none" && e.target === ov) fecharModalSenha();
});

// ESC fecha
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") fecharModalSenha();
});

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "/login";
}

function fmtData(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString();
}

function badge(text, kind) {
  const cls = kind === "ok" ? "b-ok" : (kind === "warn" ? "b-warn" : "b-bad");
  return `<span class="badge ${cls}">${text}</span>`;
}

function nivelBadge(nivel) {
  const n = String(nivel || "").toLowerCase();
  if (n === "alto") return badge("ALTO", "ok");
  if (n === "medio") return badge("MÉDIO", "warn");
  if (n === "baixo") return badge("BAIXO", "warn");
  if (n === "muito_baixo") return badge("MUITO BAIXO", "bad");
  return badge(n || "-", "warn");
}

function bombaBadge(ligada) {
  if (ligada === true) return badge("LIGADA", "warn");
  if (ligada === false) return badge("DESLIGADA", "ok");
  return badge("-", "warn");
}

function tipoBadge(tipo) {
  if (tipo === "nivel_muito_baixo") return badge("NÍVEL MUITO BAIXO", "bad");
  if (tipo === "nivel_baixo") return badge("NÍVEL BAIXO", "warn");
  if (tipo === "dispositivo_offline") return badge("DISPOSITIVO OFFLINE", "bad");
  return badge(String(tipo || "").replaceAll("_", " "), "warn");
}

function setStatusMsg(msg) {
  const el = document.getElementById("statusMsg");
  if (el) el.textContent = msg || "";
}

function resumoCard(titulo, valorHtml, sub) {
  return `
    <div style="
      border:1px solid rgba(43,43,71,.7);
      background: rgba(255,255,255,.03);
      border-radius: 14px;
      padding: 12px 12px;
    ">
      <div style="color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .3px;">
        ${titulo}
      </div>
      <div style="margin-top: 8px; font-weight: 900; font-size: 16px;">
        ${valorHtml}
      </div>
      ${sub ? `<div style="margin-top:6px; color: var(--muted); font-size: 12px;">${sub}</div>` : ""}
    </div>
  `;
}

function renderReservatoriosCliente(data) {
  const tbody = document.getElementById("tbodyReservatoriosCliente");
  const empty = document.getElementById("semReservatorios");
  if (!tbody) return;

  tbody.innerHTML = "";

  const list = Array.isArray(data?.reservatorios) ? data.reservatorios : [];

  if (empty) empty.style.display = list.length === 0 ? "block" : "none";
  if (list.length === 0) return;

  for (const r of list) {
    const u = r.ultima_leitura;

    const min =
      (r.minutos_sem_atualizar === null || r.minutos_sem_atualizar === undefined)
        ? "-"
        : r.minutos_sem_atualizar;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.nome || "-"}</td>
      <td>${r.tipo || "-"}</td>
      
      <td>${u?.criado_em ? fmtData(u.criado_em) : "-"}</td>
      <td>${u?.nivel ? nivelBadge(u.nivel) : "-"}</td>
      <td>${u ? bombaBadge(u.bomba_ligada) : "-"}</td>

      <td>${min}</td>
      <td>${r.offline ? badge("SIM", "bad") : badge("NÃO", "ok")}</td>
      <td><span class="pillCount">${r.alertas_abertos_count ?? 0}</span></td>
    `;
    tbody.appendChild(tr);
  }
}

function pickMaisRecente(reservatorios) {
  let best = null;
  for (const r of reservatorios) {
    const u = r?.ultima_leitura;
    if (!u?.criado_em) continue;
    if (!best) best = r;
    else if (new Date(u.criado_em) > new Date(best.ultima_leitura.criado_em)) best = r;
  }
  return best; // pode ser null
}

function pickMaisCritico(reservatorios) {
  const peso = { muito_baixo: 4, baixo: 3, medio: 2, alto: 1 };
  let best = null;

  for (const r of reservatorios) {
    const n = String(r?.ultima_leitura?.nivel || "").toLowerCase();
    const p = peso[n] || 0;
    if (!best) best = { r, p };
    else if (p > best.p) best = { r, p };
  }

  return best?.r || null;
}

function algumOffline(reservatorios) {
  return reservatorios.some(r => !!r.offline);
}

async function carregar() {
  setStatusMsg("Carregando...");

  const r = await fetch("/cliente/status", {
    headers: authHeaders(),
  });

  if (!r.ok) {
  if (r.status === 401 || r.status === 403) {
    window.location.href = "/login";
    return;
  }
  const txt = await r.text().catch(() => "");
  setStatusMsg("Erro no /cliente/status (" + r.status + "): " + txt);
  return;
}

  const data = await r.json();

  
  // ===== Resumo (AGREGADO DO CONDOMÍNIO) =====
const grid = document.getElementById("resumoGrid");

const nome = data.condominio?.nome || "-";
const reservatorios = Array.isArray(data.reservatorios) ? data.reservatorios : [];
const totalRes = reservatorios.length;

const rMaisRecente = pickMaisRecente(reservatorios);
const rMaisCritico = pickMaisCritico(reservatorios);

const uRecente = rMaisRecente?.ultima_leitura || null;
const atualizado = uRecente?.criado_em ? fmtData(uRecente.criado_em) : "-";

const nivelCritico = rMaisCritico?.ultima_leitura?.nivel || null;
const offlineGeral = algumOffline(reservatorios);

// texto pra deixar claro QUAL reservatório está definindo o “pior nível”
const baseTxt = rMaisCritico
  ? `${rMaisCritico.nome || "Reservatório"} • ${rMaisCritico.tipo || "-"} • ${rMaisCritico.device_id || "-"}`
  : "-";

grid.innerHTML = [
  resumoCard("Condomínio", `<span class="mono">${nome}</span>`, `Reservatórios: ${totalRes}`),

  resumoCard(
    "Pior nível (agora)",
    nivelCritico ? nivelBadge(nivelCritico) : badge("-", "warn"),
    `Base: ${baseTxt}`
  ),

  resumoCard(
    "Offline (geral)",
    offlineGeral ? badge("SIM", "bad") : badge("NÃO", "ok"),
    offlineGeral ? "Algum reservatório está offline" : "Todos online"
  ),

  resumoCard("Última atualização (geral)", `<span class="mono">${atualizado}</span>`, null),
].join("");

  // ✅ NOVO: renderiza reservatórios
renderReservatoriosCliente(data);

  // ===== Alertas =====
  const tbody = document.getElementById("tbodyAlertasCliente");
  const sem = document.getElementById("semAlertas");

  tbody.innerHTML = "";

  const alertas = Array.isArray(data.alertas_abertos) ? data.alertas_abertos : [];

  if (alertas.length === 0) {
    sem.style.display = "block";
  } else {
    sem.style.display = "none";
    alertas.forEach((a) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${tipoBadge(a.tipo)}</td>
        <td>${a.mensagem || ""}</td>
        <td>${fmtData(a.criado_em)}</td>
        <td>${fmtData(a.atualizado_em)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  setStatusMsg("Atualizado às " + new Date().toLocaleTimeString());
}

async function trocarSenha(event) {
  event.preventDefault();

  const msg = document.getElementById("senhaMsg");
  msg.textContent = "";

  const senha_atual = (document.getElementById("senhaAtual").value || "").trim();
  const senha_nova = (document.getElementById("senhaNova").value || "").trim();
  const senha_nova2 = (document.getElementById("senhaNova2").value || "").trim();

  if (!senha_atual || !senha_nova || !senha_nova2) {
    msg.textContent = "Preencha todos os campos.";
    return;
  }
  if (senha_nova.length < 6) {
    msg.textContent = "A nova senha deve ter pelo menos 6 caracteres.";
    return;
  }
  if (senha_nova !== senha_nova2) {
    msg.textContent = "A confirmação não confere.";
    return;
  }

  try {
    msg.textContent = "Salvando...";

    const r = await fetch("/cliente/trocar-senha", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ senha_atual, senha_nova }),
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      msg.textContent = data.error || ("Erro ao trocar senha (" + r.status + ")");
      return;
    }

    msg.textContent = "✅ Senha alterada com sucesso!";
    setTimeout(fecharModalSenha, 600);
  } catch (e) {
    msg.textContent = "Erro: " + e.message;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // botões do topo (precisa ter IDs no HTML)
  document.getElementById("btnAtualizarCliente")?.addEventListener("click", carregar);
  document.getElementById("btnAbrirSenha")?.addEventListener("click", abrirModalSenha);
  document.getElementById("btnSairCliente")?.addEventListener("click", logout);

  // modal senha
  document.getElementById("btnFecharSenhaTop")?.addEventListener("click", fecharModalSenha);
  document.getElementById("btnCancelarSenha")?.addEventListener("click", fecharModalSenha);

  // submit do form (precisa ter id="formTrocarSenha")
  document.getElementById("formTrocarSenha")?.addEventListener("submit", trocarSenha);

  // primeira carga + auto refresh
  carregar();
  setInterval(carregar, 10000);
});