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

// ⚠️ O SDK do Resend NÃO LANÇA em erro de API. `emails.send()` devolve
// `{ data, error }`: numa falha o `error` vem preenchido e a Promise resolve
// normalmente. Ou seja, `await resend.emails.send(...)` sem olhar o retorno
// passa por sucesso em TODOS estes casos — que são os do enum do próprio SDK:
//   invalid_from_address · validation_error · invalid_attachment ·
//   monthly_quota_exceeded · daily_quota_exceeded · rate_limit_exceeded ·
//   invalid_api_key · restricted_api_key · security_error · …
//
// Era exatamente esse o bug do envio de orçamento (relatado em 21/08/2026):
// o endpoint marcava `status = 'enviado'`, gravava `enviado_em` e respondia
// `ok: true`, e o e-mail não chegava. O front estava certo — ele checa
// `r.ok`; quem mentia era o backend.
//
// **Todo envio passa por aqui.** Nunca chamar `getResend().emails.send()`
// direto.
async function _enviar(payload, contexto) {
  const { data, error } = await getResend().emails.send(payload);
  if (error) {
    // `error.name` é o código do enum (ex.: "rate_limit_exceeded"); `message`
    // é o texto do provedor. Os dois entram na mensagem porque o código é o
    // que permite agir (cota, domínio não verificado, anexo grande demais).
    const err = new Error(
      `Resend recusou o envio (${contexto}): ${error.name || "erro"} — ${error.message || "sem detalhe"}`
    );
    err.resendCode = error.name;
    throw err;
  }
  // O id é o que permite rastrear a entrega no painel do Resend depois.
  console.log(`[email] enviado (${contexto}) id=${data?.id || "?"}`);
  return data;
}

function _emailFrom() {
  return process.env.SMTP_FROM || "comercial@generalbombas.com";
}

function _emailFromOTP() {
  return process.env.SMTP_FROM_OTP || _emailFrom();
}

async function sendOTP(toEmail, code) {
  await _enviar({
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
  }, "OTP de login");
}

// Código de verificação exigido antes de assinar um contrato (mesmo princípio
// do 2FA de login) — confirma que quem está assinando tem acesso ao e-mail
// cadastrado do signatário, não só ao link.
async function sendAssinaturaCodigo(toEmail, nome, code) {
  await _enviar({
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
  }, "código de assinatura");
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
    await _enviar({
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
    }, "alerta crítico");
  } catch (err) {
    console.error("[email] erro ao enviar alerta:", err.message);
  }
}

// ── E-mail do orçamento ─────────────────────────────────────────────────────
// Logo embutido como data URI: URL externa é bloqueada por padrão no Outlook
// (e o cliente vê um quadrado vazio). O arquivo lido aqui é o REDUZIDO
// (`public/logo-email.png`, ~20 KB), gerado por `scripts/gerar-logo-email.js`
// — o `logo-topo.png` original tem 68 KB, que viram 91 KB em base64 e deixam
// o corpo a um palmo do corte de ~102 KB do Gmail. O anexo não conta nesse
// limite; o data URI conta.
// Lido uma vez e guardado: o arquivo não muda entre envios.
//
// ⚠️ A ALTURA VAI DECLARADA, E É CALCULADA DO PRÓPRIO ARQUIVO.
// O Outlook renderiza com o motor do Word, que ignora `height:auto`: com só a
// largura declarada, ele combina a largura forçada (190 px) com a altura
// NATIVA do arquivo (83 px) e entrega o logo esticado — foi o que aconteceu no
// primeiro envio real (25/08/2026). Declarar `height` no atributo E no estilo
// é o que fecha a proporção nos três (Gmail, Outlook, app do celular).
// A altura sai do IHDR do PNG (bytes 16..24, big-endian), não de um número
// fixo: assim trocar o logo por um de outra proporção não reabre o defeito.
const LOGO_EMAIL_LARGURA = 190; // px no corpo do e-mail

function _pngDimensoes(buf) {
  const ehPng = buf.length > 24 &&
    buf.readUInt32BE(0) === 0x89504e47 &&
    buf.toString("latin1", 12, 16) === "IHDR";
  if (!ehPng) return null;
  const largura = buf.readUInt32BE(16);
  const altura  = buf.readUInt32BE(20);
  return (largura > 0 && altura > 0) ? { largura, altura } : null;
}

let _logoEmailCache;
function _logoEmail() {
  if (_logoEmailCache !== undefined) return _logoEmailCache;
  try {
    const fs = require("fs");
    const path = require("path");
    const buf = fs.readFileSync(path.join(__dirname, "..", "..", "public", "logo-email.png"));
    const dim = _pngDimensoes(buf);
    _logoEmailCache = {
      src: "data:image/png;base64," + buf.toString("base64"),
      largura: LOGO_EMAIL_LARGURA,
      // Sem IHDR legível, volta ao height:auto de antes — pior no Outlook, mas
      // melhor que chutar uma altura errada.
      altura: dim ? Math.round(LOGO_EMAIL_LARGURA * dim.altura / dim.largura) : null,
    };
  } catch (err) {
    // Sem logo o e-mail sai igual, só com o nome escrito na faixa. Um envio de
    // orçamento não pode falhar por causa de arte.
    console.error("[email] logo-email.png não pôde ser lido:", err.message);
    _logoEmailCache = null;
  }
  return _logoEmailCache;
}

// ⚠️ DUAS DATAS, DOIS FORMATADORES — não é preciosismo.
// `valido_ate` e `data_documento` são colunas DATE: dia de calendário, sem
// fuso. Passá-las por toLocaleDateString com timeZone joga a data um dia pra
// trás (servidor em UTC, driver entrega meia-noite, conversão pra UTC-3 volta
// pro dia anterior). `criado_em` é timestamptz: aí converter está certo.
// Mesma regra e mesmo motivo de `fmtDateOnlyBR`/`fmtDateBR` em
// src/services/orcamento-pdf.service.js — se mudar lá, mude aqui.
function _fmtDataSemFuso(v) {
  if (!v) return null;
  if (v instanceof Date) {
    const d = String(v.getDate()).padStart(2, "0");
    const m = String(v.getMonth() + 1).padStart(2, "0");
    return `${d}/${m}/${v.getFullYear()}`;
  }
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v);
}
function _fmtInstante(v) {
  if (!v) return null;
  return new Date(v).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// Envia o orçamento diretamente ao cliente — pelo painel (link) ou pelo PDF
// anexado, nunca pelos dois ao mesmo tempo (ver `temAnexo`).
//
// dados: { to (array de e-mails), numero, condominioNome, dataDocumento (DATE|null),
//          criadoEm (timestamptz|null), validoAte (DATE|null),
//          pdfBuffer (Buffer|null — null quando há linkPainel),
//          filename, linkPainel (string|null) }
//
// ⚠️ O TEXTO É FIXO (24/08/2026). Havia um campo "Mensagem" no modal de envio
// e uma assinatura em imagem por usuário; os dois saíram. O documento é o PDF
// anexo — o e-mail é só a carta de encaminhamento, e carta que muda a cada
// envio é carta que uma hora sai errada para cliente real. Quem precisar
// escrever algo específico responde o e-mail depois de enviado.
// As colunas `usuarios.email_mensagem` / `assinatura_blob` continuam no banco,
// paradas: a remoção foi da interface, não do dado.
async function sendOrcamentoCliente(dados) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY não configurada — envio de email indisponível");
  }
  const to = Array.isArray(dados.to) ? dados.to : [dados.to];
  if (!to.length) throw new Error("Nenhum destinatário informado");

  const numero   = dados.numero || "—";
  const condo    = dados.condominioNome || "—";
  const filename = dados.filename || `orcamento-${numero}.pdf`;
  const dataDoc  = _fmtDataSemFuso(dados.dataDocumento) || _fmtInstante(dados.criadoEm);
  const validade = _fmtDataSemFuso(dados.validoAte);
  const logo     = _logoEmail();

  // ⚠️ ANEXO E LINK NÃO CONVIVEM (25/08/2026).
  // Quando há painel, o documento mora lá — e é lá que o cliente aprova ou
  // recusa. Mandar o PDF junto dá a ele um caminho que termina sem resposta:
  // lê o anexo, fecha o e-mail, e a decisão nunca chega. Sem painel (avulso de
  // pessoa física, condomínio ainda sem login), o anexo é a única forma de o
  // documento chegar, e continua indo. Quem decide é a rota, que só gera o PDF
  // no segundo caso.
  const temAnexo = Boolean(dados.pdfBuffer);

  const E = _escaparHtml;

  // ⚠️ O CONVITE SÓ EXISTE QUANDO HÁ PARA ONDE MANDAR.
  // Só condomínio com login responde pelo painel; orçamento avulso de pessoa
  // física continua sendo só o PDF, porque não há conta para ele entrar. Quem
  // decide isso é a rota, que só passa `linkPainel` quando faz sentido —
  // mandar um botão "responder" para quem não consegue entrar seria pior que
  // não mandar nada.
  //
  // O botão é <table>, não <div> com flex: cliente de e-mail (Outlook à
  // frente) não renderiza layout moderno, e um botão quebrado no e-mail é um
  // orçamento que não volta.
  const convite = dados.linkPainel
    ? `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 6px;">
                <tr><td style="background:#f0b014;">
                  <a href="${dados.linkPainel}" style="color:#030a26;font-size:15px;font-weight:bold;text-decoration:none;display:inline-block;padding:14px 26px;">
                    Ver o orçamento e responder
                  </a>
                </td></tr>
              </table>
              <p style="margin:0 0 18px;font-size:12.5px;line-height:1.6;color:#6b7280;">
                Você entra com o mesmo login do painel do seu prédio. Na tela do
                orçamento dá para ler o documento inteiro, baixar o PDF e
                aprovar ou recusar — a gente recebe na hora.
              </p>`
    : "";

  // Onde o cliente encontra o documento — muda com o caminho que ele tem.
  // Se um dia sair um envio sem link e sem anexo, a frase some em vez de
  // mandá-lo procurar um PDF que não foi.
  const ondeEstaODocumento = dados.linkPainel
    ? "O documento completo está na sua área do cliente, no botão abaixo."
    : (temAnexo ? "O documento completo está no PDF em anexo." : "");

  // Linha da caixa de informações. Sem valor de propósito: o preço é assunto
  // do documento, e mandá-lo no corpo do e-mail o espalha por caixas de
  // entrada e encaminhamentos que ninguém controla.
  const linha = (rotulo, valor) => valor
    ? `<tr>
         <td style="padding:5px 0;font-size:13px;color:#6b7280;width:110px;">${E(rotulo)}</td>
         <td style="padding:5px 0;font-size:13px;color:#111827;font-weight:bold;">${E(valor)}</td>
       </tr>`
    : "";

  const textoPuro = [
    `Prezado(a),`,
    ``,
    `Segue o orçamento ${numero}, referente a ${condo}.${ondeEstaODocumento ? " " + ondeEstaODocumento : ""}`,
    ``,
    `Informações do orçamento`,
    `Número: ${numero}`,
    `Cliente: ${condo}`,
    dataDoc  ? `Data: ${dataDoc}` : null,
    validade ? `Válido até: ${validade}` : null,
    ``,
    // ⚠️ A versão em texto puro também leva o link. Ela não é decoração: é o
    // que alguns clientes de e-mail mostram, e é onde cai quem bloqueia HTML.
    dados.linkPainel ? `Ver o orçamento e responder: ${dados.linkPainel}` : null,
    dados.linkPainel ? `` : null,
    `Atenciosamente,`,
    `General Bombas`,
    `General Engenharia da Manutenção · (11) 2038-8679 · WhatsApp (11) 96653-6110 · comercial@generalbombas.com`,
  ].filter(l => l !== null).join("\n");

  // ⚠️ LAYOUT EM <table>, DO LADO DE FORA PRA DENTRO, com estilo inline.
  // Não é preferência: o Outlook renderiza com o motor do Word, que ignora
  // flex/grid, `max-width` em div e folha de estilo em <style>. Tabela
  // aninhada com width fixo é o único layout que chega igual no Gmail, no
  // Outlook e no app do celular.
  const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef1f7;margin:0;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:100%;background:#ffffff;border:1px solid #dfe4ee;">

      <tr><td style="background:#030a26;padding:22px 28px;">
        ${logo
          // ⚠️ O ESTILO DO <img> É O ESTILO DO ALT. Outlook bloqueia imagem por
          // padrão (foi o que aconteceu no e-mail que serviu de referência), e
          // aí o que aparece é o texto alternativo — que herda cor, fonte e
          // corpo daqui. Sem isto, o topo do e-mail ficava com "General
          // Bombas" em preto sobre a faixa marinho, ou seja, invisível.
          // O width/height duplicado (atributo + estilo) é o que segura a
          // proporção no Outlook — ver _logoEmail().
          ? `<img src="${logo.src}" width="${logo.largura}"${logo.altura ? ` height="${logo.altura}"` : ""} alt="General Bombas" style="display:block;border:0;outline:none;width:${logo.largura}px;height:${logo.altura ? logo.altura + "px" : "auto"};font-family:Helvetica,Arial,sans-serif;font-size:20px;font-weight:bold;color:#ffffff;" />`
          : `<div style="font-family:Helvetica,Arial,sans-serif;font-size:21px;font-weight:bold;color:#ffffff;letter-spacing:.5px;">GENERAL <span style="color:#f0b014;">BOMBAS</span></div>`}
        <div style="font-family:Helvetica,Arial,sans-serif;margin-top:12px;font-size:10.5px;font-weight:bold;letter-spacing:1.6px;text-transform:uppercase;color:#f0b014;">
          Orçamento comercial
        </div>
      </td></tr>

      <tr><td style="padding:28px 28px 6px;font-family:Helvetica,Arial,sans-serif;">
        <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#111827;">Prezado(a),</p>
        <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#111827;">
          Segue o orçamento <strong>${E(numero)}</strong>, referente a
          <strong>${E(condo)}</strong>. ${E(ondeEstaODocumento)}
        </p>
        ${convite}
      </td></tr>

      <tr><td style="padding:6px 28px 4px;font-family:Helvetica,Arial,sans-serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f7fb;border:1px solid #e4e8f1;">
          <tr><td style="padding:16px 18px;">
            <div style="font-size:11px;font-weight:bold;letter-spacing:1.1px;text-transform:uppercase;color:#6b7280;padding-bottom:8px;">
              Informações do orçamento
            </div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${linha("Número", numero)}
              ${linha("Cliente", condo)}
              ${linha("Data", dataDoc)}
              ${linha("Válido até", validade)}
            </table>
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:20px 28px 26px;font-family:Helvetica,Arial,sans-serif;">
        <p style="margin:0;font-size:14px;line-height:1.6;color:#111827;">Atenciosamente,</p>
        <p style="margin:2px 0 0;font-size:14px;line-height:1.6;color:#111827;font-weight:bold;">General Bombas</p>
      </td></tr>

      <tr><td style="background:#f5f7fb;border-top:1px solid #e4e8f1;padding:16px 28px;font-family:Helvetica,Arial,sans-serif;font-size:11.5px;line-height:1.7;color:#6b7280;">
        <strong style="color:#4b5563;">General Engenharia da Manutenção</strong><br />
        (11) 2038-8679 · WhatsApp (11) 96653-6110 ·
        <a href="mailto:comercial@generalbombas.com" style="color:#6b7280;">comercial@generalbombas.com</a>
      </td></tr>

    </table>
  </td></tr>
</table>`;

  await _enviar({
    from: `General Bombas <${_emailFrom()}>`,
    to,
    subject: `Orçamento ${numero} — General Bombas`,
    text: textoPuro,
    html,
    // Sem `pdfBuffer` o e-mail sai sem anexo — ver `temAnexo` acima. A chave
    // `attachments` não pode ir com array vazio: alguns provedores tratam isso
    // como anexo inválido.
    ...(temAnexo ? { attachments: [{ filename, content: dados.pdfBuffer }] } : {}),
  }, "orçamento ao cliente");
}

// Envia e-mail de solicitação de assinatura de contrato.
// dados: { to, nomeDestinatario, papel, contratoNumero, condominioNome, linkAssinatura }
async function sendContratoAssinatura(dados) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY não configurada — configure para enviar e-mails de assinatura");
  }
  const { to, nomeDestinatario, papel, contratoNumero, condominioNome, linkAssinatura } = dados;

  await _enviar({
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
  }, "link de assinatura de contrato");
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

  await _enviar({
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
  }, "lead da landing");
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
