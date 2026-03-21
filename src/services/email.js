const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendOTP(toEmail, code) {
  const from = process.env.SMTP_FROM || "telemetria@generalbombas.com";

  await resend.emails.send({
    from: `General Telemetria <${from}>`,
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

module.exports = { sendOTP };
