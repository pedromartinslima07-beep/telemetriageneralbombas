// src/routes/assinatura.routes.js
//
// Rota PÚBLICA para assinatura de contratos por link de e-mail.
// Não exige autenticação — o token UUID no URL serve como chave de acesso.
// Montado em /assinar/:token pelo app.js.

const express = require("express");
const { pool } = require("../db");
const { gerarPdfBuffer } = require("../services/contrato-pdf.service");

const router = express.Router();

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
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;color:#111;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:24px 16px 48px}
    .card{background:#fff;border-radius:14px;box-shadow:0 2px 16px rgba(0,0,0,.08);max-width:520px;width:100%;padding:32px 28px}
    .logo{display:flex;align-items:center;gap:10px;margin-bottom:24px}
    .logo-badge{width:40px;height:40px;border-radius:10px;background:#f0b014;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;color:#fff;flex-shrink:0}
    .logo-name{font-size:15px;font-weight:700;color:#111;line-height:1.2}
    .logo-sub{font-size:11px;color:#888;font-weight:400}
    h1{font-size:20px;font-weight:700;margin-bottom:4px}
    .sub{font-size:13px;color:#666;margin-bottom:24px}
    .badge{display:inline-block;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:20px}
    .badge.cliente{background:#e0f2fe;color:#0369a1}
    .badge.geral{background:#f0b01422;color:#92400e}
    table.info{width:100%;border-collapse:collapse;margin-bottom:20px}
    table.info td{padding:8px 0;font-size:13.5px;line-height:1.5;vertical-align:top}
    table.info td:first-child{color:#888;width:130px;flex-shrink:0}
    table.info td:last-child{font-weight:600}
    .divider{border:none;border-top:1px solid #eee;margin:20px 0}
    .pdf-btn{display:block;width:100%;padding:12px;border:1px solid #e5e7eb;border-radius:8px;text-align:center;font-size:14px;font-weight:500;color:#374151;text-decoration:none;background:#f9fafb;margin-bottom:20px;transition:background .15s}
    .pdf-btn:hover{background:#f3f4f6}
    label{display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px}
    input[type=text]{width:100%;padding:11px 14px;border:1.5px solid #d1d5db;border-radius:8px;font-size:14px;outline:none;transition:border .15s}
    input[type=text]:focus{border-color:#f0b014}
    .hint{font-size:12px;color:#9ca3af;margin-top:6px;margin-bottom:16px}
    .submit-btn{width:100%;padding:13px;background:#f0b014;border:none;border-radius:8px;font-size:15px;font-weight:700;color:#fff;cursor:pointer;transition:opacity .15s}
    .submit-btn:hover{opacity:.9}
    .submit-btn:disabled{opacity:.6;cursor:not-allowed}
    .success{text-align:center;padding:12px 0}
    .success-icon{font-size:48px;margin-bottom:12px}
    .success h2{font-size:20px;font-weight:700;margin-bottom:6px;color:#16a34a}
    .success p{font-size:14px;color:#555;line-height:1.6}
    .success .dados{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;text-align:left;margin-top:16px;font-size:13px;color:#166534;line-height:1.8}
    .error-msg{color:#dc2626;font-size:13px;margin-bottom:12px}
    .already{text-align:center;padding:8px 0}
    .already-icon{font-size:40px;margin-bottom:10px}
    .already h2{font-size:18px;font-weight:700;color:#16a34a;margin-bottom:6px}
    .already p{font-size:13px;color:#555}
    .footer{font-size:11px;color:#aaa;text-align:center;margin-top:24px}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <div class="logo-badge">G</div>
      <div><div class="logo-name">General Bombas</div><div class="logo-sub">Contrato de prestação de serviços</div></div>
    </div>
    ${corpo}
  </div>
  <div class="footer">General Bombas © ${new Date().getFullYear()} — Este documento tem validade jurídica como assinatura eletrônica</div>
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
    <form method="POST" action="/assinar/${_esc(token)}">
      <label for="nome">Seu nome completo</label>
      <input type="text" id="nome" name="nome" placeholder="${_esc(nome)}" autocomplete="name" required />
      <div class="hint">Digite exatamente como consta no contrato. Este registro terá validade como assinatura eletrônica.</div>
      <button type="submit" class="submit-btn">Confirmar assinatura</button>
    </form>
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

// POST /assinar/:token — confirma assinatura
router.post("/:token", express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const { token } = req.params;
    const nome = String(req.body?.nome || "").trim();

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
        `UPDATE contratos SET assinatura_cliente_nome = $1, assinatura_cliente_ip = $2, assinatura_cliente_em = NOW() WHERE id = $3`,
        [nome, ip, ct.id]
      );
    } else {
      await pool.query(
        `UPDATE contratos SET assinatura_geral_nome = $1, assinatura_geral_ip = $2, assinatura_geral_em = NOW() WHERE id = $3`,
        [nome, ip, ct.id]
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
