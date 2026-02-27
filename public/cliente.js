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

function abrirModalSenha(){
  document.getElementById("senhaMsg").textContent = "";
  document.getElementById("senhaAtual").value = "";
  document.getElementById("senhaNova").value = "";
  document.getElementById("senhaNova2").value = "";
  document.getElementById("senhaOverlay").style.display = "flex";
}

function fecharModalSenha(){
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

async function carregar() {
  setStatusMsg("Carregando...");

  const r = await fetch("/cliente/status", {
    headers: authHeaders(),
  });

  if (!r.ok) {
    // token inválido / expirado
    window.location.href = "/login";
    return;
  }

  const data = await r.json();

  // ===== Resumo =====
  const grid = document.getElementById("resumoGrid");
  const u = data.ultima_leitura;

  const nome = data.condominio?.nome || "-";
  const device = data.condominio?.device_id || "-";
  const nivel = u?.nivel ?? "-";
  const bomba = u?.bomba_ligada;
  const atualizado = u?.criado_em ? fmtData(u.criado_em) : "-";

  grid.innerHTML = [
    resumoCard("Condomínio", `<span class="mono">${nome}</span>`, `Device: ${device}`),
    resumoCard("Nível atual", nivelBadge(nivel), null),
    resumoCard("Bomba", bombaBadge(bomba), null),
    resumoCard("Última atualização", `<span class="mono">${atualizado}</span>`, null),
  ].join("");

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

async function trocarSenha(event){
  event.preventDefault();

  const msg = document.getElementById("senhaMsg");
  msg.textContent = "";

  const senha_atual = (document.getElementById("senhaAtual").value || "").trim();
  const senha_nova = (document.getElementById("senhaNova").value || "").trim();
  const senha_nova2 = (document.getElementById("senhaNova2").value || "").trim();

  if (!senha_atual || !senha_nova || !senha_nova2){
    msg.textContent = "Preencha todos os campos.";
    return;
  }
  if (senha_nova.length < 6){
    msg.textContent = "A nova senha deve ter pelo menos 6 caracteres.";
    return;
  }
  if (senha_nova !== senha_nova2){
    msg.textContent = "A confirmação não confere.";
    return;
  }

  try{
    msg.textContent = "Salvando...";

    const r = await fetch("/cliente/trocar-senha", {
      method: "POST",
      headers: { "Content-Type":"application/json", ...authHeaders() },
      body: JSON.stringify({ senha_atual, senha_nova }),
    });

    const data = await r.json().catch(()=> ({}));

    if (!r.ok){
      msg.textContent = data.error || ("Erro ao trocar senha (" + r.status + ")");
      return;
    }

    msg.textContent = "✅ Senha alterada com sucesso!";
    setTimeout(fecharModalSenha, 600);
  } catch(e){
    msg.textContent = "Erro: " + e.message;
  }
}

carregar();
setInterval(carregar, 10000);

async function trocarSenha(event){
  event.preventDefault();

  const senhaAtual = (document.getElementById("senhaAtual")?.value || "").trim();
  const senhaNova  = (document.getElementById("senhaNova")?.value || "").trim();
  const senhaNova2 = (document.getElementById("senhaNova2")?.value || "").trim();

  const msg = document.getElementById("senhaMsg");
  if (msg) msg.textContent = "";

  if (!senhaAtual || !senhaNova || !senhaNova2){
    if (msg) msg.textContent = "Preencha todos os campos.";
    return;
  }

  if (senhaNova.length < 6){
    if (msg) msg.textContent = "A nova senha deve ter pelo menos 6 caracteres.";
    return;
  }

  if (senhaNova !== senhaNova2){
    if (msg) msg.textContent = "As senhas não coincidem.";
    return;
  }

  try{
    if (msg) msg.textContent = "Salvando...";

    const r = await fetch("/cliente/trocar-senha", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ senha_atual: senhaAtual, senha_nova: senhaNova }),
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok){
      if (msg) msg.textContent = data.error || ("Erro (" + r.status + ")");
      return;
    }

    if (msg) msg.textContent = "✅ Senha alterada com sucesso!";
    document.getElementById("senhaAtual").value = "";
    document.getElementById("senhaNova").value = "";
    document.getElementById("senhaNova2").value = "";

    setTimeout(fecharModalSenha, 600);

  } catch (e){
    if (msg) msg.textContent = "Erro: " + e.message;
  }
}