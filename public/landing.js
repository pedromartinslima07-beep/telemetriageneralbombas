// public/landing.js — landing pública (public/index.html)
//
// Três responsabilidades, sem dependência externa:
//   1. a sequência de carga do corte do prédio (a água subindo);
//   2. o medidor lateral, que é o indicador de rolagem da página;
//   3. o envio do formulário para POST /leads.
//
// ⚠️ Esta página NÃO registra o service worker de propósito. O sw.js existe
// para o PWA do painel (admin/cliente/técnico); instalar um SW no navegador de
// um visitante anônimo que talvez nunca volte não traz benefício e ainda cria
// uma camada de cache a mais para depurar. Quem vira cliente entra pelo /login,
// que registra o SW normalmente.

(function () {
  "use strict";

  // As faixas são as MESMAS do backend (`nivelFromPct` em alertas.service.js):
  // baixo < 45, crítico < 20. Se mudarem lá, mudam aqui — a página perde a
  // honestidade se ilustrar um alerta em faixa diferente da que o produto usa.
  var FAIXA_BAIXO   = 45;
  var FAIXA_CRITICO = 20;

  var semMovimento = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ─── 1. Corte do prédio ───────────────────────────────────────────────────

  var predio = document.getElementById("predio");

  // Janelas do prédio geradas aqui para não inflar o HTML com 60 <rect>.
  var janelas = document.getElementById("janelas");
  if (janelas) {
    var NS = "http://www.w3.org/2000/svg";
    var marcacao = "";
    for (var linha = 0; linha < 8; linha++) {
      for (var col = 0; col < 6; col++) {
        marcacao += '<rect x="' + (124 + col * 36) + '" y="' + (172 + linha * 40) +
                    '" width="20" height="26" rx="1"/>';
      }
    }
    janelas.innerHTML = marcacao;
    void NS;
  }

  // Move a água de um tanque: o grupo é transladado para baixo em % da própria
  // altura, então 0% = cheio e 100% = vazio.
  function encher(el, pct) {
    if (!el) return;
    el.style.transform = "translateY(" + (100 - pct) + "%)";
  }

  var cxAgua = document.getElementById("cxAgua");
  var ciAgua = document.getElementById("ciAgua");

  var NIVEL_CAIXA    = 62;
  var NIVEL_CISTERNA = 78;

  if (predio) {
    if (semMovimento) {
      encher(cxAgua, NIVEL_CAIXA);
      encher(ciAgua, NIVEL_CISTERNA);
    } else {
      // Sequência única de carga, na ordem em que a água realmente anda:
      // cisterna → bomba/prumada → caixa superior. Depois disso, para.
      predio.classList.add("is-pronto");
      setTimeout(function () { encher(ciAgua, NIVEL_CISTERNA); }, 220);
      setTimeout(function () { predio.classList.add("is-fluindo"); }, 900);
      setTimeout(function () { encher(cxAgua, NIVEL_CAIXA); }, 1150);
      setTimeout(function () { predio.classList.remove("is-fluindo"); }, 2500);
    }
  }

  // ─── 2. Medidor lateral ───────────────────────────────────────────────────
  //
  // A conceito: ler a página é esvaziar o reservatório. O nível começa em 100
  // no topo e chega a 0 no rodapé, cruzando as mesmas faixas do produto.

  var gauge    = document.getElementById("gauge");
  var gAgua    = document.getElementById("gaugeAgua");
  var gMarca   = document.getElementById("gaugeMarca");
  var gPct     = document.getElementById("gaugePct");
  var gMob     = document.getElementById("gaugeMob");
  var gMobFill = document.getElementById("gaugeMobFill");

  function atualizarMedidor() {
    var alcance = document.documentElement.scrollHeight - window.innerHeight;
    var lido    = alcance > 0 ? Math.min(1, Math.max(0, window.scrollY / alcance)) : 0;
    var nivel   = Math.round((1 - lido) * 100);

    if (gAgua)  gAgua.style.height = (lido * 100) + "%";
    if (gMarca) gMarca.style.top   = (lido * 100) + "%";
    if (gPct)   gPct.textContent   = nivel;
    if (gMobFill) gMobFill.style.width = (lido * 100) + "%";

    var faixa = nivel < FAIXA_CRITICO ? "is-critico"
              : nivel < FAIXA_BAIXO   ? "is-baixo"
              : "";

    [gauge, gMob].forEach(function (el) {
      if (!el) return;
      el.classList.remove("is-baixo", "is-critico");
      if (faixa) el.classList.add(faixa);
    });
  }

  var pendente = false;
  function aoRolar() {
    if (pendente) return;
    pendente = true;
    requestAnimationFrame(function () { atualizarMedidor(); pendente = false; });
  }

  if (gauge || gMob) {
    atualizarMedidor();
    window.addEventListener("scroll", aoRolar, { passive: true });
    window.addEventListener("resize", aoRolar);
  }

  // ─── 3. Tanques do mock do painel ─────────────────────────────────────────
  //
  // Geometria copiada de `_telTanqueSVG` (public/admin.js) para o desenho ser
  // literalmente o mesmo que o cliente vê depois de contratar. Estático: o
  // movimento da página já foi gasto no corte do prédio.

  var TOP = 20, BOT = 114, RX = 31, RY = 8;
  var ALT = BOT - TOP;

  function corDoNivel(pct) {
    if (pct < FAIXA_CRITICO) return "#ef4444";
    if (pct < FAIXA_BAIXO)   return "#f0b014";
    return "#3ee0f0";
  }

  function tanqueSVG(id, pct) {
    var nivel = Math.max(0, Math.min(100, pct));
    var cor   = corDoNivel(nivel);
    var yAgua = TOP + (1 - nivel / 100) * ALT;

    var corpo = "M" + (50 - RX) + " " + TOP +
      " A" + RX + " " + RY + " 0 0 0 " + (50 + RX) + " " + TOP +
      " L" + (50 + RX) + " " + BOT +
      " A" + RX + " " + RY + " 0 0 1 " + (50 - RX) + " " + BOT + " Z";

    var ticks = [0, 25, 50, 75, 100].map(function (t) {
      var y = TOP + (1 - t / 100) * ALT;
      return '<line x1="10" y1="' + y.toFixed(1) + '" x2="15" y2="' + y.toFixed(1) +
             '" stroke="rgba(140,200,220,.28)" stroke-width="1"/>';
    }).join("");

    return '<svg viewBox="-4 4 108 118" role="img" aria-label="Nível ' + Math.round(nivel) + '%">' +
      '<defs>' +
        '<clipPath id="c-' + id + '"><path d="' + corpo + '"/></clipPath>' +
        '<linearGradient id="g-' + id + '" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="' + cor + '" stop-opacity=".92"/>' +
          '<stop offset="1" stop-color="' + cor + '" stop-opacity=".48"/>' +
        '</linearGradient>' +
      '</defs>' +
      ticks +
      '<path d="' + corpo + '" fill="rgba(0,0,0,.34)"/>' +
      '<g clip-path="url(#c-' + id + ')">' +
        '<rect x="' + (50 - RX) + '" y="' + yAgua.toFixed(1) + '" width="' + (RX * 2) +
              '" height="' + (BOT - yAgua + RY).toFixed(1) + '" fill="url(#g-' + id + ')"/>' +
        '<ellipse cx="50" cy="' + yAgua.toFixed(1) + '" rx="' + RX + '" ry="' + RY + '" fill="' + cor + '"/>' +
      '</g>' +
      '<path d="' + corpo + '" fill="none" stroke="rgba(140,200,220,.34)" stroke-width="1.4"/>' +
      '<ellipse cx="50" cy="' + TOP + '" rx="' + RX + '" ry="' + RY +
               '" fill="none" stroke="rgba(140,200,220,.34)" stroke-width="1.4"/>' +
    '</svg>';
  }

  var mock = document.getElementById("mockTanques");
  if (mock) {
    var TANQUES = [
      { nome: "Inferior", nivel: 78 },
      { nome: "Superior", nivel: 38 },
      { nome: "Recalque", nivel: 91 },
    ];
    mock.innerHTML = TANQUES.map(function (t, i) {
      return '<div class="mock-tanque' + (t.nivel < FAIXA_BAIXO ? " is-alerta" : "") + '">' +
        tanqueSVG("m" + i, t.nivel) +
        '<div class="mock-pct" style="color:' + corDoNivel(t.nivel) + '">' + t.nivel + '%</div>' +
        '<div class="mock-nome">' + t.nome + '</div>' +
      '</div>';
    }).join("");
  }

  // ─── 4. Formulário ────────────────────────────────────────────────────────

  var form  = document.getElementById("lpForm");
  var msg   = document.getElementById("lpMsg");
  var botao = document.getElementById("lpSubmit");

  function mostrar(texto, tipo) {
    if (!msg) return;
    msg.textContent = texto;
    msg.className = "form-msg" + (tipo ? " is-" + tipo : "");
  }

  if (form) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();

      var campos = {
        nome:       form.nome.value.trim(),
        condominio: form.condominio.value.trim(),
        email:      form.email.value.trim(),
        telefone:   form.telefone.value.trim(),
        unidades:   form.unidades.value,
        mensagem:   form.mensagem.value.trim(),
        site:       form.site.value,   // honeypot
        origem:     "landing",
      };

      form.nome.classList.toggle("is-erro", !campos.nome);
      form.email.classList.toggle("is-erro", !campos.email);

      if (!campos.nome || !campos.email) {
        mostrar("Preencha nome e e-mail para continuar.", "erro");
        return;
      }

      botao.disabled = true;
      botao.textContent = "Enviando…";
      mostrar("", "");

      try {
        var r = await fetch("/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(campos),
        });

        // Erro do servidor costuma vir em JSON, mas 502/504 de proxy vêm em
        // HTML — ver CLAUDE.md. Por isso o parse é protegido.
        var dados = {};
        try { dados = await r.json(); } catch (_) {}

        if (!r.ok) {
          mostrar(dados.error || "Não foi possível enviar. Tente novamente.", "erro");
          botao.disabled = false;
          botao.textContent = "Enviar";
          return;
        }

        form.reset();
        botao.textContent = "Enviado";
        mostrar("Recebemos seu contato. Retornamos em breve.", "ok");
      } catch (_) {
        mostrar("Sem conexão com o servidor. Tente novamente em instantes.", "erro");
        botao.disabled = false;
        botao.textContent = "Enviar";
      }
    });
  }

  var ano = document.getElementById("lpAno");
  if (ano) ano.textContent = String(new Date().getFullYear());
})();
