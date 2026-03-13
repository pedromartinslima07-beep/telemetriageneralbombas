const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtps.uhserver.com",
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true,
  authMethod: "LOGIN",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendOTP(toEmail, code) {
  const from = `"General Telemetria" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`;

  await transporter.sendMail({
    from,
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
