// src/routes/assinatura.routes.js
//
// Rota PÚBLICA para assinatura de contratos por link de e-mail.
// Não exige autenticação — o token UUID no URL serve como chave de acesso.
// Montado em /assinar/:token pelo app.js.

const express = require("express");
const { pool } = require("../db");
const { gerarPdfBuffer } = require("../services/contrato-pdf.service");

const router = express.Router();

// CSP permissiva para esta rota pública: precisa de script inline (canvas/pad)
// e Google Fonts. O helmet global bloqueia inline scripts por padrão.
router.use((req, res, next) => {
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: blob:; " +
    "connect-src 'self';"
  );
  next();
});

// ─── Helpers HTML ────────────────────────────────────────────────────────────

function _esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function _fmtData(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function _fmtValor(v) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const _TIPO_LABEL = {
  bombas:       "Motobombas Hidráulicas",
  piscina:      "Piscina",
  dedetizacao:  "Dedetização",
  desratizacao: "Desratização",
};

function _shell(titulo, corpo) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${_esc(titulo)} — General Bombas</title>
  <link rel="icon" type="image/png" href="/static/favicon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;font-size:14px;color:#e1e3ef;background:#090b18;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:32px 16px 56px;-webkit-font-smoothing:antialiased}
    body::before{content:'';position:fixed;inset:0;background:radial-gradient(ellipse at 50% 30%,rgba(240,176,20,.07) 0%,transparent 60%),radial-gradient(ellipse at 80% 80%,rgba(74,120,247,.05) 0%,transparent 55%);pointer-events:none}
    .card{position:relative;width:100%;max-width:520px;background:#111326;border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:40px 36px 36px;box-shadow:0 20px 60px rgba(0,0,0,.6)}
    .card::before{content:'';position:absolute;top:0;left:24px;right:24px;height:2px;background:linear-gradient(90deg,transparent,#f0b014 30%,#4a78f7 70%,transparent);border-radius:0 0 2px 2px}
    .logo-wrap{display:flex;justify-content:center;margin-bottom:28px}
    .logo-wrap img{height:56px;width:auto;display:block}
    h1{font-size:19px;font-weight:700;color:#e1e3ef;margin-bottom:4px}
    .sub{font-size:13px;color:#60617e;margin-bottom:20px}
    .badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:20px}
    .badge.cliente{background:rgba(74,120,247,.15);color:#7ba4f7;border:1px solid rgba(74,120,247,.25)}
    .badge.geral{background:rgba(240,176,20,.12);color:#f0b014;border:1px solid rgba(240,176,20,.25)}
    table.info{width:100%;border-collapse:collapse;margin-bottom:20px}
    table.info td{padding:7px 0;font-size:13px;line-height:1.5;vertical-align:top;border-bottom:1px solid rgba(255,255,255,.04)}
    table.info td:first-child{color:#60617e;width:120px}
    table.info td:last-child{font-weight:600;color:#e1e3ef}
    .divider{border:none;border-top:1px solid rgba(255,255,255,.06);margin:20px 0}
    .pdf-btn{display:block;width:100%;padding:11px;border:1px solid rgba(255,255,255,.1);border-radius:9px;text-align:center;font-size:13.5px;font-weight:500;color:#9094ae;text-decoration:none;background:rgba(255,255,255,.03);margin-bottom:20px;transition:border-color .15s,color .15s}
    .pdf-btn:hover{border-color:rgba(255,255,255,.2);color:#e1e3ef}
    label{display:block;font-size:11px;font-weight:700;color:#60617e;text-transform:uppercase;letter-spacing:.45px;margin-bottom:6px}
    .hint{font-size:12px;color:#44455a;margin-top:5px;margin-bottom:14px}
    .submit-btn{width:100%;padding:12px;background:#f0b014;border:none;border-radius:9px;font-size:14px;font-weight:800;color:#111;cursor:pointer;transition:background .15s,transform .08s;font-family:inherit;letter-spacing:.2px}
    .submit-btn:hover{background:#d9a010}
    .submit-btn:active{transform:translateY(1px)}
    .submit-btn:disabled{opacity:.5;cursor:not-allowed}
    .sign-tabs{display:flex;margin-bottom:12px;border:1px solid rgba(255,255,255,.08);border-radius:9px;overflow:hidden}
    .sign-tab{flex:1;padding:9px;font-size:13px;font-weight:600;background:transparent;border:none;cursor:pointer;color:#44455a;transition:background .15s,color .15s;font-family:inherit}
    .sign-tab.active{background:rgba(255,255,255,.06);color:#e1e3ef}
    .sign-canvas-wrap{border:1px solid rgba(255,255,255,.15);border-radius:9px;position:relative;margin-bottom:8px;touch-action:none}
    .sign-canvas-wrap canvas{display:block;width:100%;border-radius:8px;cursor:crosshair;background:#fff}
    .sign-canvas-header{display:flex;justify-content:flex-end;margin-bottom:4px}
    .sign-clear{font-size:12px;color:#44455a;background:none;border:none;cursor:pointer;padding:0;font-family:inherit}
    .sign-clear:hover{color:#9094ae}
    .sign-name-input{width:100%;padding:11px 14px;border:1px solid rgba(255,255,255,.08);border-radius:9px;font-size:14px;outline:none;transition:border-color .15s,box-shadow .15s;margin-bottom:10px;background:rgba(255,255,255,.04);color:#e1e3ef;font-family:inherit}
    .sign-name-input::placeholder{color:#44455a}
    .sign-name-input:focus{border-color:rgba(240,176,20,.5);box-shadow:0 0 0 3px rgba(240,176,20,.08)}
    .success{text-align:center;padding:8px 0}
    .success-icon{font-size:44px;margin-bottom:12px}
    .success h2{font-size:19px;font-weight:700;margin-bottom:6px;color:#4ade80}
    .success p{font-size:13px;color:#60617e;line-height:1.6}
    .success .dados{background:rgba(74,222,128,.06);border:1px solid rgba(74,222,128,.2);border-radius:9px;padding:14px;text-align:left;margin-top:16px;font-size:13px;color:#86efac;line-height:1.9}
    .error-msg{color:#f87171;font-size:13px;margin-bottom:12px;padding:10px 14px;border-radius:8px;background:rgba(240,68,56,.1);border:1px solid rgba(240,68,56,.2)}
    .already{text-align:center;padding:8px 0}
    .already-icon{font-size:40px;margin-bottom:10px}
    .already h2{font-size:18px;font-weight:700;color:#4ade80;margin-bottom:6px}
    .already p{font-size:13px;color:#60617e}
    .already .dados{background:rgba(74,222,128,.06);border:1px solid rgba(74,222,128,.2);border-radius:9px;padding:14px;text-align:left;margin-top:16px;font-size:13px;color:#86efac;line-height:1.9}
    .footer{font-size:11.5px;color:#44455a;text-align:center;margin-top:24px}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo-wrap">
      <img src="/static/login-logo.png" alt="General Bombas" />
    </div>
    ${corpo}
  </div>
  <div class="footer">General Bombas © ${new Date().getFullYear()} — Assinatura eletrônica com validade jurídica</div>
</body>
</html>`;
}

function _paginaAssinatura({ ct, token, ehCliente, erro }) {
  const papel = ehCliente ? "CONTRATANTE" : "CONTRATADA (General Bombas)";
  const nome  = ehCliente
    ? (ct.signatario_nome || "Representante do contratante")
    : (ct.signatario_geral_nome || "Representante da General Bombas");
  const tipo  = _TIPO_LABEL[ct.servico_tipo] || "Prestação de Serviços";

  return _shell("Assinar Contrato", `
    <h1>Assinar Contrato</h1>
    <div class="sub">${_esc(ct.condominio_nome || "—")}</div>
    <span class="badge ${ehCliente ? "cliente" : "geral"}">${papel}</span>
    <table class="info">
      <tr><td>Número</td><td>${_esc(ct.numero || "—")}</td></tr>
      <tr><td>Serviço</td><td>${_esc(tipo)}</td></tr>
      <tr><td>Valor mensal</td><td>${_esc(_fmtValor(ct.valor_mensal))}</td></tr>
      <tr><td>Vigência</td><td>${_esc(ct.inicio_em ? new Date(ct.inicio_em).toLocaleDateString("pt-BR") : "—")}${ct.fim_em ? " a " + new Date(ct.fim_em).toLocaleDateString("pt-BR") : ""}</td></tr>
    </table>
    <a class="pdf-btn" href="/assinar/${_esc(token)}/pdf" target="_blank">📄 Visualizar contrato em PDF</a>
    <hr class="divider">
    ${erro ? `<div class="error-msg">${_esc(erro)}</div>` : ""}

    <label>Seu nome completo</label>
    <input class="sign-name-input" id="nomeInput" type="text" placeholder="${_esc(nome)}" autocomplete="name" />

    <label>CPF ou RG</label>
    <input class="sign-name-input" id="docInput" type="text" placeholder="000.000.000-00 ou RG" autocomplete="off" maxlength="30" style="margin-bottom:14px;" />

    <div class="sign-tabs">
      <button class="sign-tab active" data-tab="desenhar" type="button">✍️ Desenhar assinatura</button>
      <button class="sign-tab" data-tab="digitar" type="button">⌨️ Assinar digitando</button>
    </div>

    <div id="tab-desenhar">
      <div class="sign-canvas-header"><button class="sign-clear" type="button" id="clearDraw">Limpar</button></div>
      <div class="sign-canvas-wrap">
        <canvas id="drawCanvas" height="140"></canvas>
      </div>
      <div class="hint">Desenhe sua assinatura acima com o mouse ou dedo.</div>
    </div>

    <div id="tab-digitar" style="display:none">
      <div class="sign-canvas-header"><button class="sign-clear" type="button" id="clearType">Limpar</button></div>
      <div class="sign-canvas-wrap">
        <canvas id="typeCanvas" height="140"></canvas>
      </div>
      <div class="hint">Sua assinatura aparecerá em caligrafia acima.</div>
    </div>

    <br>
    <div id="erroMsg" class="error-msg" style="display:none"></div>
    <button type="button" class="submit-btn" id="btnConfirmar">Confirmar assinatura</button>

    <script>
    (function() {
      const TOKEN = "${_esc(token)}";
      let modoAtual = "desenhar";
      let fontsReady = false;
      document.fonts.load("48px 'Great Vibes'").then(() => {
        fontsReady = true;
        if (modoAtual === "digitar") renderCursivo();
      }).catch(() => {
        fontsReady = true;
        if (modoAtual === "digitar") renderCursivo();
      });

      // ── Tabs ──
      document.querySelectorAll(".sign-tab").forEach(btn => {
        btn.addEventListener("click", () => {
          modoAtual = btn.dataset.tab;
          document.querySelectorAll(".sign-tab").forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          document.getElementById("tab-desenhar").style.display = modoAtual === "desenhar" ? "" : "none";
          document.getElementById("tab-digitar").style.display  = modoAtual === "digitar"  ? "" : "none";
          if (modoAtual === "digitar") {
            requestAnimationFrame(() => {
              const tc = document.getElementById("typeCanvas");
              resizeCanvas(tc);
              if (fontsReady) renderCursivo();
            });
          }
        });
      });

      // ── Canvas de desenho ──
      const drawCanvas = document.getElementById("drawCanvas");
      const dctx = drawCanvas.getContext("2d");
      let drawing = false, lastX = 0, lastY = 0;

      function resizeCanvas(canvas) {
        const w = canvas.parentElement.clientWidth;
        canvas.width  = w;
      }
      resizeCanvas(drawCanvas);
      window.addEventListener("resize", () => {
        resizeCanvas(drawCanvas);
        if (modoAtual === "digitar") { resizeCanvas(document.getElementById("typeCanvas")); if (fontsReady) renderCursivo(); }
      });

      function pos(e, canvas) {
        const r = canvas.getBoundingClientRect();
        const t = e.touches ? e.touches[0] : e;
        return [(t.clientX - r.left) * (canvas.width / r.width),
                (t.clientY - r.top)  * (canvas.height / r.height)];
      }

      function startDraw(e) {
        drawing = true;
        [lastX, lastY] = pos(e, drawCanvas);
        dctx.beginPath();
        dctx.arc(lastX, lastY, 1.2, 0, Math.PI * 2);
        dctx.fillStyle = "#1a1f2e";
        dctx.fill();
        e.preventDefault();
      }
      function moveDraw(e) {
        if (!drawing) return;
        const [x, y] = pos(e, drawCanvas);
        dctx.beginPath();
        dctx.moveTo(lastX, lastY);
        dctx.lineTo(x, y);
        dctx.strokeStyle = "#1a1f2e";
        dctx.lineWidth = 2.2;
        dctx.lineCap = "round";
        dctx.lineJoin = "round";
        dctx.stroke();
        [lastX, lastY] = [x, y];
        e.preventDefault();
      }
      function endDraw() { drawing = false; }

      drawCanvas.addEventListener("mousedown", startDraw);
      drawCanvas.addEventListener("mousemove", moveDraw);
      drawCanvas.addEventListener("mouseup", endDraw);
      drawCanvas.addEventListener("mouseleave", endDraw);
      drawCanvas.addEventListener("touchstart", startDraw, { passive: false });
      drawCanvas.addEventListener("touchmove",  moveDraw,  { passive: false });
      drawCanvas.addEventListener("touchend",   endDraw);

      document.getElementById("clearDraw").addEventListener("click", () => {
        dctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      });

      // ── Canvas de texto cursivo ──
      const typeCanvas = document.getElementById("typeCanvas");
      const tctx = typeCanvas.getContext("2d");

      function renderCursivo() {
        const nome = document.getElementById("nomeInput").value.trim();
        tctx.clearRect(0, 0, typeCanvas.width, typeCanvas.height);
        if (!nome) return;
        const fontSize = Math.min(68, typeCanvas.width / (nome.length * 0.45 + 1));
        tctx.font = fontSize + "px 'Great Vibes', cursive";
        tctx.fillStyle = "#1a1f2e";
        tctx.textAlign = "center";
        tctx.textBaseline = "alphabetic";
        tctx.fillText(nome, typeCanvas.width / 2, typeCanvas.height - 4);
      }

      document.getElementById("nomeInput").addEventListener("input", () => {
        if (modoAtual === "digitar" && fontsReady) renderCursivo();
      });
      document.getElementById("clearType").addEventListener("click", () => {
        tctx.clearRect(0, 0, typeCanvas.width, typeCanvas.height);
      });

      // Recorta o canvas ao bounding box do conteúdo (remove espaço transparente)
      function _cropCanvas(src) {
        const ctx = src.getContext("2d");
        const { width, height } = src;
        const data = ctx.getImageData(0, 0, width, height).data;
        let top = height, bottom = 0, left = width, right = 0;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (data[(y * width + x) * 4 + 3] > 0) {
              if (y < top) top = y;
              if (y > bottom) bottom = y;
              if (x < left) left = x;
              if (x > right) right = x;
            }
          }
        }
        if (top > bottom) return src.toDataURL("image/png");
        const pad = 6;
        const cx = Math.max(0, left - pad), cy = Math.max(0, top - pad);
        const cw = Math.min(width, right + pad) - cx;
        const ch = Math.min(height, bottom + pad) - cy;
        const out = document.createElement("canvas");
        out.width = cw; out.height = ch;
        out.getContext("2d").drawImage(src, cx, cy, cw, ch, 0, 0, cw, ch);
        return out.toDataURL("image/png");
      }

      // ── Submit ──
      document.getElementById("btnConfirmar").addEventListener("click", async () => {
        const nome = document.getElementById("nomeInput").value.trim();
        const doc  = document.getElementById("docInput").value.trim();
        const erroEl = document.getElementById("erroMsg");
        erroEl.style.display = "none";

        if (!nome || nome.length < 3) {
          erroEl.textContent = "Digite seu nome completo (mínimo 3 caracteres).";
          erroEl.style.display = "";
          return;
        }

        const canvas = modoAtual === "desenhar" ? drawCanvas : typeCanvas;
        const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        const vazio  = !pixels.some((v, i) => i % 4 === 3 && v > 0);
        if (vazio && modoAtual === "desenhar") {
          erroEl.textContent = "Por favor desenhe sua assinatura antes de confirmar.";
          erroEl.style.display = "";
          return;
        }

        if (modoAtual === "digitar") renderCursivo();
        const img = _cropCanvas(canvas);

        const btn = document.getElementById("btnConfirmar");
        btn.disabled = true;
        btn.textContent = "Enviando...";

        try {
          const resp = await fetch("/assinar/" + TOKEN, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nome, doc, img }),
          });
          const html = await resp.text();
          document.open(); document.write(html); document.close();
        } catch(e) {
          erroEl.textContent = "Erro ao enviar. Tente novamente.";
          erroEl.style.display = "";
          btn.disabled = false;
          btn.textContent = "Confirmar assinatura";
        }
      });
    })();
    </script>
  `);
}

function _paginaSucesso({ ct, nome, ehCliente, ambosAssinaram }) {
  const papel = ehCliente ? "CONTRATANTE" : "CONTRATADA";
  return _shell("Assinatura confirmada", `
    <div class="success">
      <div class="success-icon">✅</div>
      <h2>Assinatura registrada!</h2>
      <p>Sua confirmação foi salva com sucesso.</p>
      <div class="dados">
        <strong>Nome:</strong> ${_esc(nome)}<br>
        <strong>Papel:</strong> ${papel}<br>
        <strong>Contrato:</strong> ${_esc(ct.numero || ct.id)}<br>
        <strong>Condomínio:</strong> ${_esc(ct.condominio_nome || "—")}<br>
        <strong>Data/hora:</strong> ${_esc(_fmtData(new Date().toISOString()))}
      </div>
      ${ambosAssinaram
        ? `<p style="margin-top:16px;font-size:14px;color:#16a34a;font-weight:600;">Contrato totalmente assinado por ambas as partes.</p>`
        : `<p style="margin-top:16px;font-size:13px;color:#666;">Aguardando confirmação da outra parte.</p>`
      }
    </div>
  `);
}

function _paginaJaAssinou({ ct, nome, ehCliente }) {
  const papel = ehCliente ? "CONTRATANTE" : "CONTRATADA";
  return _shell("Já assinado", `
    <div class="already">
      <div class="already-icon">✅</div>
      <h2>Você já assinou este contrato</h2>
      <p>Sua assinatura como <strong>${papel}</strong> já foi registrada.</p>
      <div class="dados" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;text-align:left;margin-top:16px;font-size:13px;color:#166534;line-height:1.8;">
        <strong>Nome registrado:</strong> ${_esc(nome)}<br>
        <strong>Contrato:</strong> ${_esc(ct.numero || ct.id)}<br>
        <strong>Condomínio:</strong> ${_esc(ct.condominio_nome || "—")}
      </div>
    </div>
  `);
}

function _pagina404() {
  return _shell("Link inválido", `
    <div style="text-align:center;padding:16px 0">
      <div style="font-size:40px;margin-bottom:12px">🔗</div>
      <h1 style="margin-bottom:8px">Link inválido ou expirado</h1>
      <p style="font-size:14px;color:#666;">Este link de assinatura não existe ou já foi utilizado.</p>
    </div>
  `);
}

// ─── Rotas ───────────────────────────────────────────────────────────────────

// GET /assinar/:token — página de assinatura
router.get("/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const r = await pool.query(
      `SELECT c.*, cond.nome AS condominio_nome
       FROM contratos c
       LEFT JOIN condominios cond ON cond.id = c.condominio_id
       WHERE c.assinatura_token_cliente = $1 OR c.assinatura_token_geral = $1`,
      [token]
    );
    if (!r.rows.length) return res.status(404).send(_pagina404());

    const ct         = r.rows[0];
    const ehCliente  = ct.assinatura_token_cliente === token;
    const nomeReg    = ehCliente ? ct.assinatura_cliente_nome : ct.assinatura_geral_nome;
    const jaAssinou  = ehCliente ? !!ct.assinatura_cliente_em : !!ct.assinatura_geral_em;

    if (jaAssinou) {
      return res.send(_paginaJaAssinou({ ct, nome: nomeReg, ehCliente }));
    }

    res.send(_paginaAssinatura({ ct, token, ehCliente }));
  } catch (err) {
    console.error("[assinatura] GET /:token:", err);
    res.status(500).send(_pagina404());
  }
});

// GET /assinar/:token/pdf — serve o PDF sem autenticação
router.get("/:token/pdf", async (req, res) => {
  try {
    const { token } = req.params;
    const r = await pool.query(
      `SELECT id FROM contratos WHERE assinatura_token_cliente = $1 OR assinatura_token_geral = $1`,
      [token]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Link inválido" });

    const { buf, ct } = await gerarPdfBuffer(r.rows[0].id);
    const numero = ct.numero || String(r.rows[0].id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="contrato-${numero}.pdf"`);
    res.send(buf);
  } catch (err) {
    console.error("[assinatura] GET /:token/pdf:", err);
    res.status(500).send("Erro ao gerar PDF");
  }
});

// POST /assinar/:token — confirma assinatura (JSON: { nome, img })
router.post("/:token", express.json({ limit: "2mb" }), async (req, res) => {
  try {
    const { token } = req.params;
    const nome = String(req.body?.nome || "").trim();
    const doc  = String(req.body?.doc  || "").trim().slice(0, 30);
    const img  = typeof req.body?.img === "string" && req.body.img.startsWith("data:image/") ? req.body.img : null;

    const r = await pool.query(
      `SELECT c.*, cond.nome AS condominio_nome
       FROM contratos c
       LEFT JOIN condominios cond ON cond.id = c.condominio_id
       WHERE c.assinatura_token_cliente = $1 OR c.assinatura_token_geral = $1`,
      [token]
    );
    if (!r.rows.length) return res.status(404).send(_pagina404());

    const ct        = r.rows[0];
    const ehCliente = ct.assinatura_token_cliente === token;

    if (!nome || nome.length < 3) {
      return res.send(_paginaAssinatura({ ct, token, ehCliente, erro: "Digite seu nome completo (mínimo 3 caracteres)." }));
    }

    const jaAssinou = ehCliente ? !!ct.assinatura_cliente_em : !!ct.assinatura_geral_em;
    if (jaAssinou) {
      const nomeReg = ehCliente ? ct.assinatura_cliente_nome : ct.assinatura_geral_nome;
      return res.send(_paginaJaAssinou({ ct, nome: nomeReg, ehCliente }));
    }

    const ip = (req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim() || "desconhecido";

    if (ehCliente) {
      await pool.query(
        `UPDATE contratos SET assinatura_cliente_nome = $1, assinatura_cliente_ip = $2, assinatura_cliente_em = NOW(), assinatura_cliente_img = $4, assinatura_cliente_doc = $5 WHERE id = $3`,
        [nome, ip, ct.id, img, doc || null]
      );
    } else {
      await pool.query(
        `UPDATE contratos SET assinatura_geral_nome = $1, assinatura_geral_ip = $2, assinatura_geral_em = NOW(), assinatura_geral_img = $4, assinatura_geral_doc = $5 WHERE id = $3`,
        [nome, ip, ct.id, img, doc || null]
      );
    }

    // Verifica se ambos assinaram → marca contrato como assinado
    const upd = await pool.query(
      `SELECT assinatura_cliente_em, assinatura_geral_em FROM contratos WHERE id = $1`,
      [ct.id]
    );
    const ambos = upd.rows[0]?.assinatura_cliente_em && upd.rows[0]?.assinatura_geral_em;
    if (ambos) {
      await pool.query(
        `UPDATE contratos SET zapsign_status = 'assinado', assinado_em = NOW() WHERE id = $1 AND assinado_em IS NULL`,
        [ct.id]
      );
    }

    res.send(_paginaSucesso({ ct, nome, ehCliente, ambosAssinaram: !!ambos }));
  } catch (err) {
    console.error("[assinatura] POST /:token:", err);
    res.status(500).send(_pagina404());
  }
});

module.exports = { assinaturaRouter: router };
