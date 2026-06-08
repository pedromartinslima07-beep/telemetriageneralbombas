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

async function sendOTP(toEmail, code) {
  await getResend().emails.send({
    from: `General Telemetria <${_emailFrom()}>`,
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

// Envia email avisando que um chamado está há muito tempo em atendimento
// (Fase 7I). Vai pra mesma lista de destinatários do alerta crítico —
// `alertas.email_destinatario`.
//
// dados: { chamado_id, titulo, condominio_nome, tecnico_nome, horas, desde_iso }
async function sendChamadoAtrasoEmail(dados) {
  const destinatariosRaw = await getConfig("alertas.email_destinatario", "");
  if (!destinatariosRaw) return;
  if (!process.env.RESEND_API_KEY) return;

  const to = String(destinatariosRaw)
    .split(",")
    .map(s => s.trim())
    .filter(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
  if (!to.length) return;

  const condo = dados.condominio_nome || "—";
  const tecnico = dados.tecnico_nome || "—";
  const titulo = dados.titulo || "Sem título";
  const horas = Number(dados.horas || 0).toFixed(1);
  const cor = "#f0b014";
  const dataFmt = dados.desde_iso ? new Date(dados.desde_iso).toLocaleString("pt-BR") : "—";

  try {
    await getResend().emails.send({
      from: `General Telemetria <${_emailFrom()}>`,
      to,
      subject: `[Aviso] Chamado #${dados.chamado_id} em atendimento há ${horas}h — ${condo}`,
      text: [
        `Chamado em atendimento há mais que o limite configurado.`,
        `Chamado: CH-${String(dados.chamado_id).padStart(4, "0")} — ${titulo}`,
        `Condomínio: ${condo}`,
        `Técnico: ${tecnico}`,
        `Em atendimento desde: ${dataFmt}`,
        `Tempo decorrido: ${horas}h`,
        "",
        "Verifique se o técnico precisa de apoio ou se esqueceu de fechar o chamado.",
      ].join("\n"),
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:24px;background:#0b0f1f;color:#eef0fb;border-radius:12px;">
          <div style="display:flex;align-items:center;gap:10px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,.08);">
            <div style="width:36px;height:36px;border-radius:8px;background:${cor};display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:18px;">⏱</div>
            <div>
              <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.6px;">Aviso operacional</div>
              <div style="font-size:16px;font-weight:700;color:${cor};">Chamado em atendimento há ${horas}h</div>
            </div>
          </div>
          <table style="width:100%;margin-top:16px;font-size:13.5px;line-height:1.6;border-collapse:collapse;">
            <tr><td style="color:#94a3b8;padding:6px 0;width:130px;">Chamado</td><td style="font-weight:600;">CH-${String(dados.chamado_id).padStart(4, "0")} — ${titulo}</td></tr>
            <tr><td style="color:#94a3b8;padding:6px 0;">Condomínio</td><td style="font-weight:600;">${condo}</td></tr>
            <tr><td style="color:#94a3b8;padding:6px 0;">Técnico</td><td style="font-weight:600;">${tecnico}</td></tr>
            <tr><td style="color:#94a3b8;padding:6px 0;">Em atendimento desde</td><td style="font-weight:600;">${dataFmt}</td></tr>
          </table>
          <div style="margin-top:14px;padding:12px;background:rgba(255,255,255,.04);border-radius:8px;font-size:13px;color:#cbd5e1;">
            Verifique se o técnico precisa de apoio ou se esqueceu de fechar o chamado.
          </div>
        </div>
      `,
    });
  } catch (err) {
    console.error("[email] erro ao enviar aviso de atraso:", err.message);
  }
}

// Envia email avisando a equipe comercial que a IA registrou um pedido de orçamento.
// Vai pra mesma lista de destinatários de `alertas.email_destinatario`.
//
// dados: { orcamento_id, numero, condominio_nome, resumo_pedido }
async function sendOrcamentoIAEmail(dados) {
  const destinatariosRaw = await getConfig("alertas.email_destinatario", "");
  if (!destinatariosRaw) return;
  if (!process.env.RESEND_API_KEY) return;

  const to = String(destinatariosRaw)
    .split(",")
    .map(s => s.trim())
    .filter(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
  if (!to.length) return;

  const numero  = dados.numero || `#${dados.orcamento_id}`;
  const condo   = dados.condominio_nome || "Não identificado";
  const resumo  = dados.resumo_pedido || "—";
  const dataFmt = new Date().toLocaleString("pt-BR");
  const cor     = "#f0b014";

  try {
    await getResend().emails.send({
      from: `General Telemetria <${_emailFrom()}>`,
      to,
      subject: `[Orçamento] Novo pedido via WhatsApp — ${numero}`,
      text: [
        `Novo pedido de orçamento registrado pela IA (WhatsApp).`,
        `Número: ${numero}`,
        `Condomínio: ${condo}`,
        `Pedido: ${resumo}`,
        `Recebido em: ${dataFmt}`,
        "",
        "Acesse o painel → Orçamentos → aba Rascunho para preencher e enviar.",
      ].join("\n"),
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:24px;background:#0b0f1f;color:#eef0fb;border-radius:12px;">
          <div style="display:flex;align-items:center;gap:10px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,.08);">
            <div style="width:36px;height:36px;border-radius:8px;background:${cor};display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:18px;">💰</div>
            <div>
              <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.6px;">Novo pedido via WhatsApp</div>
              <div style="font-size:16px;font-weight:700;color:${cor};">Orçamento ${numero}</div>
            </div>
          </div>
          <table style="width:100%;margin-top:16px;font-size:13.5px;line-height:1.6;border-collapse:collapse;">
            <tr><td style="color:#94a3b8;padding:6px 0;width:130px;">Número</td><td style="font-weight:600;">${numero}</td></tr>
            <tr><td style="color:#94a3b8;padding:6px 0;">Condomínio</td><td style="font-weight:600;">${condo}</td></tr>
            <tr><td style="color:#94a3b8;padding:6px 0;">Recebido em</td><td style="font-weight:600;">${dataFmt}</td></tr>
          </table>
          <div style="margin-top:14px;padding:12px;background:rgba(255,255,255,.04);border-radius:8px;font-size:13px;color:#cbd5e1;">
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Pedido do cliente</div>
            ${resumo}
          </div>
          <p style="margin-top:18px;font-size:12px;color:#6b7280;">
            Acesse o painel → <strong style="color:#f0b014;">Orçamentos → aba Rascunho</strong> para preencher os valores e enviar ao cliente.
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error("[email] erro ao enviar notificação de orçamento IA:", err.message);
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

  const assinaturaHtml = dados.assinaturaUrl
    ? `<div style="margin-top:24px;"><img src="${dados.assinaturaUrl}" alt="Assinatura" style="max-width:100%;height:auto;display:block;" /></div>`
    : `<p style="margin-top:24px;font-size:12px;color:#6b7280;">General Bombas</p>`;

  const mensagemHtml = mensagem
    .split("\n")
    .map(l => `<p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#eef0fb;">${l || "&nbsp;"}</p>`)
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

module.exports = { sendOTP, sendAlertaEmail, sendChamadoAtrasoEmail, sendOrcamentoIAEmail, sendOrcamentoCliente };
