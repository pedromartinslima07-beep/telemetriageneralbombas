const { Resend } = require("resend");
const { getConfig } = require("./config.service");

let _resend = null;
function getResend() {
  if (_resend) return _resend;
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY não configurada — envio de email indisponível");
  }
  _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

function _emailFrom() {
  return process.env.SMTP_FROM || "comercial@generalbombas.com";
}

function _emailFromOTP() {
  return process.env.SMTP_FROM_OTP || _emailFrom();
}

async function sendOTP(toEmail, code) {
  await getResend().emails.send({
    from: `General Telemetria <${_emailFromOTP()}>`,
    to: toEmail,
    subject: "Seu código de acesso — General Telemetria",
    text: [
      `Seu código de verificação: ${code}`,
      "",
      "Ele expira em 10 minutos.",
      "Se você não tentou fazer login, ignore este email.",
    ].join("\n"),
    html: `
      <div style="font-family:sans-serif;max-width:420px;margin:auto;padding:24px">
        <h2 style="color:#1a1a2e;margin-bottom:4px">General Telemetria</h2>
        <p style="color:#555;margin-top:0">Verificação de acesso</p>
        <p>Use o código abaixo para concluir seu login:</p>
        <div style="font-size:34px;font-weight:bold;letter-spacing:10px;color:#1a1a2e;
                    padding:18px;background:#f4f4f4;border-radius:8px;text-align:center">
          ${code}
        </div>
        <p style="color:#888;font-size:13px;margin-top:16px">
          Expira em <strong>10 minutos</strong>.<br>
          Se você não tentou fazer login, ignore este email.
        </p>
      </div>
    `,
  });
}

// Código de verificação exigido antes de assinar um contrato (mesmo princípio
// do 2FA de login) — confirma que quem está assinando tem acesso ao e-mail
// cadastrado do signatário, não só ao link.
async function sendAssinaturaCodigo(toEmail, nome, code) {
  await getResend().emails.send({
    from: `General Bombas <${_emailFromOTP()}>`,
    to: toEmail,
    subject: "Código para assinar seu contrato — General Bombas",
    text: [
      `Olá${nome ? ", " + nome : ""},`,
      "",
      `Seu código de verificação para assinar o contrato: ${code}`,
      "",
      "Ele expira em 10 minutos.",
      "Se você não solicitou esta assinatura, ignore este email.",
    ].join("\n"),
    html: `
      <div style="font-family:sans-serif;max-width:420px;margin:auto;padding:24px">
        <h2 style="color:#1a1a2e;margin-bottom:4px">General Bombas</h2>
        <p style="color:#555;margin-top:0">Verificação de assinatura de contrato</p>
        <p>Use o código abaixo para confirmar sua identidade e assinar o contrato:</p>
        <div style="font-size:34px;font-weight:bold;letter-spacing:10px;color:#1a1a2e;
                    padding:18px;background:#f4f4f4;border-radius:8px;text-align:center">
          ${code}
        </div>
        <p style="color:#888;font-size:13px;margin-top:16px">
          Expira em <strong>10 minutos</strong>.<br>
          Se você não solicitou esta assinatura, ignore este email.
        </p>
      </div>
    `,
  });
}

// Tradução dos tipos de alerta pra labels amigáveis no email
const _TIPO_LABEL = {
  dispositivo_offline: "Dispositivo OFFLINE",
  nivel_muito_baixo:   "Nível MUITO BAIXO",
  nivel_baixo:         "Nível baixo",
};
const _TIPO_COR = {
  dispositivo_offline: "#ef4444",
  nivel_muito_baixo:   "#ef4444",
  nivel_baixo:         "#f0b014",
};

// Envia email de alerta crítico para os destinatários configurados em
// 'alertas.email_destinatario'. Silencioso se config vazia ou key ausente.
//
// dados: { tipo, mensagem, reservatorio_nome, condominio_nome, device_id, nivel_pct }
async function sendAlertaEmail(dados) {
  const destinatariosRaw = await getConfig("alertas.email_destinatario", "");
  if (!destinatariosRaw) return; // não configurado = não envia
  if (!process.env.RESEND_API_KEY) return; // sem provedor = não envia

  const to = String(destinatariosRaw)
    .split(",")
    .map(s => s.trim())
    .filter(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
  if (!to.length) return;

  const tipo  = dados.tipo || "alerta";
  const label = _TIPO_LABEL[tipo] || tipo.replaceAll("_", " ").toUpperCase();
  const cor   = _TIPO_COR[tipo] || "#f0b014";
  const condo = dados.condominio_nome || "—";
  const reserv= dados.reservatorio_nome || dados.device_id || "—";
  const dataFmt = new Date().toLocaleString("pt-BR");

  try {
    await getResend().emails.send({
      from: `General Telemetria <${_emailFrom()}>`,
      to,
      subject: `[Alerta] ${label} — ${condo}`,
      text: [
        `Alerta: ${label}`,
        `Condomínio: ${condo}`,
        `Reservatório: ${reserv}`,
        dados.nivel_pct != null ? `Nível: ${dados.nivel_pct}%` : null,
        `Detalhes: ${dados.mensagem || "-"}`,
        `Detectado em: ${dataFmt}`,
        "",
        "Acesse o painel para mais informações.",
      ].filter(Boolean).join("\n"),
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:24px;background:#0b0f1f;color:#eef0fb;border-radius:12px;">
          <div style="display:flex;align-items:center;gap:10px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,.08);">
            <div style="width:36px;height:36px;border-radius:8px;background:${cor};display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:18px;">!</div>
            <div>
              <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.6px;">Alerta automático</div>
              <div style="font-size:16px;font-weight:700;color:${cor};">${label}</div>
            </div>
          </div>
          <table style="width:100%;margin-top:16px;font-size:13.5px;line-height:1.6;border-collapse:collapse;">
            <tr><td style="color:#94a3b8;padding:6px 0;width:130px;">Condomínio</td><td style="font-weight:600;">${condo}</td></tr>
            <tr><td style="color:#94a3b8;padding:6px 0;">Reservatório</td><td style="font-weight:600;">${reserv}</td></tr>
            ${dados.nivel_pct != null ? `<tr><td style="color:#94a3b8;padding:6px 0;">Nível</td><td style="font-weight:600;">${dados.nivel_pct}%</td></tr>` : ""}
            <tr><td style="color:#94a3b8;padding:6px 0;">Detectado em</td><td style="font-weight:600;">${dataFmt}</td></tr>
          </table>
          <div style="margin-top:14px;padding:12px;background:rgba(255,255,255,.04);border-radius:8px;font-size:13px;color:#cbd5e1;">
            ${dados.mensagem || "Sem detalhes adicionais."}
          </div>
          <p style="margin-top:18px;font-size:12px;color:#6b7280;">
            Este alerta foi gerado automaticamente pelo sistema General Telemetria.
            Acesse o painel para visualizar histórico, abrir chamados e mais detalhes.
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error("[email] erro ao enviar alerta:", err.message);
  }
}

// Envia o orçamento (PDF anexado) diretamente ao cliente.
//
// dados: { to (array de e-mails), numero, condominioNome, validoAte (iso|null),
//          valorTotal (number|null), pdfBuffer (Buffer), filename }
async function sendOrcamentoCliente(dados) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY não configurada — envio de email indisponível");
  }
  const to = Array.isArray(dados.to) ? dados.to : [dados.to];
  if (!to.length) throw new Error("Nenhum destinatário informado");

  const numero  = dados.numero || "—";
  const condo   = dados.condominioNome || "—";
  const filename = dados.filename || `orcamento-${numero}.pdf`;

  const mensagem = dados.mensagem
    ? String(dados.mensagem).trim()
    : `Segue em anexo o orçamento ${numero} referente a ${condo}.\n\nQualquer dúvida, estamos à disposição.`;

  const assinaturaHtml = dados.assinaturaDataUrl
    ? `<div style="margin-top:24px;"><img src="${dados.assinaturaDataUrl}" alt="Assinatura" style="max-width:100%;height:auto;display:block;" /></div>`
    : `<p style="margin-top:24px;font-size:12px;color:#6b7280;">General Bombas</p>`;

  const mensagemHtml = mensagem
    .split("\n")
    .map(l => `<p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#111827;">${l || "&nbsp;"}</p>`)
    .join("");

  await getResend().emails.send({
    from: `General Bombas <${_emailFrom()}>`,
    to,
    subject: `Orçamento ${numero} — General Bombas`,
    text: mensagem,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:32px 28px;background:#ffffff;color:#111827;">
        ${mensagemHtml}
        ${assinaturaHtml}
      </div>
    `,
    attachments: [{ filename, content: dados.pdfBuffer }],
  });
}

// Envia e-mail de solicitação de assinatura de contrato.
// dados: { to, nomeDestinatario, papel, contratoNumero, condominioNome, linkAssinatura }
async function sendContratoAssinatura(dados) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY não configurada — configure para enviar e-mails de assinatura");
  }
  const { to, nomeDestinatario, papel, contratoNumero, condominioNome, linkAssinatura } = dados;

  await getResend().emails.send({
    from:    `General Bombas <${_emailFrom()}>`,
    to,
    subject: `Contrato ${contratoNumero} — Pendente de assinatura`,
    text: [
      `Olá${nomeDestinatario ? ", " + nomeDestinatario : ""},`,
      "",
      `O contrato ${contratoNumero} de prestação de serviços para ${condominioNome} está pendente de sua assinatura.`,
      "",
      `Clique no link abaixo para visualizar o contrato e confirmar sua assinatura:`,
      linkAssinatura,
      "",
      `Se você não esperava este e-mail, por favor ignore ou entre em contato: comercial@generalbombas.com`,
    ].join("\n"),
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:0;background:#f5f5f5;">
        <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06);">
          <div style="background:#f0b014;padding:24px 28px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:36px;height:36px;border-radius:8px;background:rgba(0,0,0,.15);display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;color:#fff;">G</div>
              <div style="color:#fff;font-weight:700;font-size:16px;">General Bombas</div>
            </div>
          </div>
          <div style="padding:28px;">
            <h2 style="font-size:18px;font-weight:700;color:#111;margin:0 0 6px;">Contrato pendente de assinatura</h2>
            <p style="font-size:13px;color:#888;margin:0 0 20px;">Você está assinando como: <strong style="color:#111;">${papel}</strong></p>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px;">
              <tr><td style="padding:7px 0;color:#888;width:120px;">Contrato</td><td style="font-weight:600;">${contratoNumero}</td></tr>
              <tr><td style="padding:7px 0;color:#888;">Condomínio</td><td style="font-weight:600;">${condominioNome}</td></tr>
            </table>
            <a href="${linkAssinatura}" style="display:block;background:#f0b014;color:#fff;text-align:center;padding:14px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;margin-bottom:20px;">
              Visualizar e assinar contrato
            </a>
            <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0;">
              Ou copie o link: <span style="word-break:break-all;">${linkAssinatura}</span>
            </p>
          </div>
          <div style="padding:16px 28px;background:#f9fafb;border-top:1px solid #eee;font-size:11px;color:#9ca3af;text-align:center;">
            Este e-mail foi enviado automaticamente pelo sistema General Bombas. Dúvidas: comercial@generalbombas.com
          </div>
        </div>
      </div>
    `,
  });
}

// Avisa o comercial que entrou um lead pela landing pública.
// dados: { nome, condominio, email, telefone, unidades, mensagem }
//
// Diferente dos outros envios daqui, este é interno (equipe → equipe), então o
// `reply_to` aponta pro lead: responder o e-mail já responde a pessoa certa.
async function sendLeadNovo(dados) {
  const destino = process.env.LEADS_EMAIL_DESTINO || _emailFrom();

  const linhas = [
    ["Nome",       dados.nome],
    ["Condomínio", dados.condominio],
    ["E-mail",     dados.email],
    ["Telefone",   dados.telefone],
    ["Unidades",   dados.unidades],
    ["Mensagem",   dados.mensagem],
  ].filter(([, v]) => v);

  await getResend().emails.send({
    from: `General Telemetria <${_emailFrom()}>`,
    to: destino,
    reply_to: dados.email,
    subject: `Novo lead: ${dados.condominio || dados.nome}`,
    text: linhas.map(([k, v]) => `${k}: ${v}`).join("\n"),
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:32px 28px;background:#ffffff;color:#111827;">
        <h2 style="margin:0 0 20px;font-size:18px;">Novo contato pela landing</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          ${linhas.map(([k, v]) => `
            <tr>
              <td style="padding:8px 12px 8px 0;color:#6b7280;vertical-align:top;white-space:nowrap;">${k}</td>
              <td style="padding:8px 0;color:#111827;">${_escaparHtml(v)}</td>
            </tr>`).join("")}
        </table>
        <p style="margin:24px 0 0;font-size:12px;color:#6b7280;">
          Responder este e-mail responde direto para o contato.
        </p>
      </div>
    `,
  });
}

// O conteúdo vem de formulário público — nunca interpolar cru no HTML.
function _escaparHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = { sendOTP, sendAssinaturaCodigo, sendAlertaEmail, sendOrcamentoCliente, sendContratoAssinatura, sendLeadNovo };
