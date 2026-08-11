// public/landing.js — landing pública (public/index.html)
//
// Cinco responsabilidades, sem dependência externa:
//   1. revelação por corte (a máscara diagonal que varre placa e manchete);
//   2. o instrumento do hero — roteiro de leituras simuladas;
//   3. o trilho da madrugada, preso ao scroll;
//   4. o diagrama do prédio ligado à lista de peças;
//   5. envio do formulário para POST /leads.
//
// ⚠️ Esta página NÃO registra o service worker de propósito. O sw.js existe
// para o PWA do painel (admin/cliente/técnico); instalar um SW no navegador de
// um visitante anônimo que talvez nunca volte não traz benefício e ainda cria
// uma camada de cache a mais para depurar. Quem vira cliente entra pelo /login,
// que registra o SW normalmente.

(function () {
  "use strict";

  var raiz = document.documentElement;
  var reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var temObs = "IntersectionObserver" in window;
  var temMask =
    window.CSS &&
    CSS.supports &&
    (CSS.supports("mask-image", "linear-gradient(#000, #000)") ||
      CSS.supports("-webkit-mask-image", "linear-gradient(#000, #000)"));

  // ─── 1. Revelação por corte ───────────────────────────────────────────────
  //
  // O estado escondido só é aplicado quando dá para animar de volta: sem
  // IntersectionObserver ou sem mask, a página fica visível como está no HTML.

  if (temObs && temMask) {
    raiz.classList.add("js-corte");

    // Dois tratamentos, de propósito. O corte diagonal é o gesto de marca e
    // fica reservado a quatro elementos; espalhá-lo por trinta vira tique e
    // deixa a página com uma entrada só. O resto sobe em silêncio, e parágrafo
    // comum não entra em nenhum dos dois.
    var comCorte = ".hero-txt h1, .instr, .ficha, .chapa-anot";
    var comSubida =
      "h2.corte-txt, .hero .lede, .hero-acoes, .hero-selo, .lede-centro," +
      " .chapas .chapa, .predio, .peca, .duvida, .fecho-lista, .noite-fecho";

    var alvos = [];
    [[comCorte, "rev"], [comSubida, "sobe"]].forEach(function (par) {
      [].forEach.call(document.querySelectorAll(par[0]), function (el) {
        el.classList.add(par[1]);
        alvos.push(el);
      });
    });
    [].forEach.call(document.querySelectorAll(".noite-ev"), function (el) {
      alvos.push(el);
    });

    // O escalonamento é por grupo (irmãos com a mesma classe), não global:
    // uma lista longa não pode acumular dois segundos de atraso no último item.
    var contador = {};
    alvos.forEach(function (el) {
      var chave = el.className;
      contador[chave] = (contador[chave] || 0) + 1;
      var i = Math.min(contador[chave] - 1, 4);
      if (i > 0) el.style.setProperty("--atraso", (i * 0.09).toFixed(2) + "s");
    });

    var obsRev = new IntersectionObserver(
      function (entradas) {
        entradas.forEach(function (e) {
          if (!e.isIntersecting) return;
          e.target.classList.add("is-vis");
          obsRev.unobserve(e.target);
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 }
    );
    alvos.forEach(function (el) { obsRev.observe(el); });
  }

  // ─── 2. O instrumento ─────────────────────────────────────────────────────
  //
  // Roteiro fixo de uma madrugada: o nível cai, cruza 45 % e 20 % (as mesmas
  // faixas do backend), a bomba é acionada e o reservatório normaliza. Os
  // números são interpolados para que a leitura acompanhe a coluna.
  // ⚠️ São dados SIMULADOS e a placa diz isso — nunca apresentar como real.

  var instr = document.getElementById("instr");
  if (instr) {
    var elAgua     = document.getElementById("instrAgua");
    var elNivel    = document.getElementById("instrNivel");
    var elColuna   = document.getElementById("instrColuna");
    var elCorrente = document.getElementById("instrCorrente");
    var elEstado   = document.getElementById("instrEstado");
    var elEstadoTx = document.getElementById("instrEstadoTxt");
    var elRelogio  = document.getElementById("instrRelogio");

    // Altura útil do reservatório do exemplo: 300 cm.
    var ALTURA_CM = 300;

    var roteiro = [
      { n: 78, a: 0,   h: "02:10", e: "ok",      t: "Leitura normal",                 d: 3200 },
      { n: 63, a: 0,   h: "02:22", e: "ok",      t: "Nível caindo fora do padrão",    d: 2600 },
      { n: 44, a: 0,   h: "02:40", e: "baixo",   t: "Nível baixo — alerta aberto",    d: 3000 },
      { n: 28, a: 0,   h: "02:55", e: "baixo",   t: "Queda contínua, bomba parada",   d: 2600 },
      { n: 18, a: 0,   h: "03:05", e: "critico", t: "Nível crítico — chamado aberto", d: 3200 },
      { n: 21, a: 6.4, h: "03:26", e: "critico", t: "Técnico no local, bomba ligada", d: 2800 },
      { n: 52, a: 6.4, h: "04:30", e: "baixo",   t: "Reservatório reabastecendo",     d: 2800 },
      { n: 84, a: 0,   h: "05:30", e: "ok",      t: "Normalizado. Ninguém acordou",   d: 4200 }
    ];

    var passo = 0;
    var rodando = false;
    var timer = null;
    var quadro = null;

    function pintar(n, a, h, e, t) {
      elAgua.style.setProperty("--n", n.toFixed(1) + "%");
      elNivel.textContent = Math.round(n);
      elColuna.textContent = Math.round((n / 100) * ALTURA_CM);
      elCorrente.textContent = a.toFixed(1).replace(".", ",");
      elRelogio.textContent = h;
      instr.dataset.estado = e;
      elEstado.dataset.estado = e;
      elEstadoTx.textContent = t;
    }

    // Anima a lâmina d'água E as duas leituras derivadas dela no mesmo laço.
    // ⚠️ A posição da coluna NÃO pode voltar a ser uma transição do CSS: com
    // duas curvas diferentes (bezier no CSS, cúbica aqui) o instrumento mostra
    // uma coluna que discorda do próprio número no meio do percurso.
    // Corrente e estado ficam de fora porque são eventos — chaveiam, não deslizam.
    function transicionar(de, para, dur, aoFim) {
      // Um passo pode começar antes do anterior terminar; sem cancelar, os
      // dois laços escrevem no mesmo número e a leitura briga com a coluna.
      if (quadro) { cancelAnimationFrame(quadro); quadro = null; }
      var t0 = performance.now();
      function tick(agora) {
        var p = Math.min((agora - t0) / dur, 1);
        var s = 1 - Math.pow(1 - p, 3);
        var n = de + (para - de) * s;
        elAgua.style.setProperty("--n", n.toFixed(2) + "%");
        elNivel.textContent = Math.round(n);
        elColuna.textContent = Math.round((n / 100) * ALTURA_CM);
        if (p < 1) { quadro = requestAnimationFrame(tick); }
        else { quadro = null; aoFim(); }
      }
      quadro = requestAnimationFrame(tick);
    }

    function avancar() {
      if (!rodando) return;
      var anterior = roteiro[(passo - 1 + roteiro.length) % roteiro.length];
      var atual = roteiro[passo];

      // `--n` é escrito só dentro de transicionar(), quadro a quadro, junto
      // com as leituras que dependem dele. Aqui só entram os eventos.
      elCorrente.textContent = atual.a.toFixed(1).replace(".", ",");
      elRelogio.textContent = atual.h;
      instr.dataset.estado = atual.e;
      elEstado.dataset.estado = atual.e;
      elEstadoTx.textContent = atual.t;

      transicionar(anterior.n, atual.n, 1050, function () {});

      passo = (passo + 1) % roteiro.length;
      timer = setTimeout(avancar, atual.d);
    }

    function comecar() {
      if (rodando) return;
      rodando = true;
      timer = setTimeout(avancar, 900);
    }
    function parar() {
      rodando = false;
      if (timer) { clearTimeout(timer); timer = null; }
      if (quadro) { cancelAnimationFrame(quadro); quadro = null; }
    }

    pintar(roteiro[0].n, roteiro[0].a, roteiro[0].h, roteiro[0].e, roteiro[0].t);

    if (reduzido) {
      // Sem movimento: mostra o momento que importa, o alerta já aberto.
      pintar(18, 0, "03:05", "critico", "Nível crítico — chamado aberto");
    } else if (temObs) {
      // Não gastar bateria com a placa fora da tela.
      new IntersectionObserver(
        function (entradas) {
          entradas.forEach(function (e) { e.isIntersecting ? comecar() : parar(); });
        },
        { threshold: 0.25 }
      ).observe(instr);
      document.addEventListener("visibilitychange", function () {
        document.hidden ? parar() : comecar();
      });
    } else {
      comecar();
    }
  }

  // ─── 3. Trilho da madrugada ───────────────────────────────────────────────

  var trilho = document.getElementById("noiteTrilho");
  var guia = document.getElementById("noiteGuia");
  var barra = document.getElementById("barra");
  var pendente = false;

  function aoRolar() {
    if (barra) barra.classList.toggle("is-rolada", window.scrollY > 12);

    if (guia && trilho && !reduzido) {
      var r = trilho.getBoundingClientRect();
      var alvo = window.innerHeight * 0.62;
      var p = (alvo - r.top) / r.height;
      guia.style.height = Math.max(0, Math.min(1, p)) * 100 + "%";
    }
    pendente = false;
  }

  window.addEventListener(
    "scroll",
    function () {
      if (pendente) return;
      pendente = true;
      requestAnimationFrame(aoRolar);
    },
    { passive: true }
  );
  aoRolar();

  // ─── 4. Diagrama do prédio ────────────────────────────────────────────────

  var pecas = document.querySelector(".pecas");
  if (pecas) {
    var itens = [].slice.call(pecas.querySelectorAll(".peca"));
    itens.forEach(function (item) {
      ["mouseenter", "focus"].forEach(function (ev) {
        item.addEventListener(ev, function () {
          pecas.dataset.ativa = item.dataset.peca;
        });
      });
      ["mouseleave", "blur"].forEach(function (ev) {
        item.addEventListener(ev, function () { delete pecas.dataset.ativa; });
      });
    });
  }

  // ─── 5. Formulário ────────────────────────────────────────────────────────

  var form = document.getElementById("lpForm");
  var msg = document.getElementById("lpMsg");
  var botao = document.getElementById("lpSubmit");

  function mostrar(texto, tipo) {
    if (!msg) return;
    msg.textContent = texto;
    msg.className = "ficha-msg" + (tipo ? " is-" + tipo : "");
  }

  function marcarErro(campo, temErro) {
    campo.classList.toggle("is-erro", temErro);
    campo.setAttribute("aria-invalid", temErro ? "true" : "false");
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

      marcarErro(form.nome, !campos.nome);
      marcarErro(form.email, !campos.email);

      if (!campos.nome || !campos.email) {
        mostrar("Falta o nome e o e-mail para a gente conseguir responder.", "erro");
        (campos.nome ? form.email : form.nome).focus();
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
          mostrar(dados.error || "O envio não completou. Tente de novo em instantes.", "erro");
          botao.disabled = false;
          botao.textContent = "Enviar";
          return;
        }

        form.reset();
        marcarErro(form.nome, false);
        marcarErro(form.email, false);
        botao.textContent = "Enviado";
        mostrar("Recebemos seu contato. A gente responde em breve.", "ok");
      } catch (_) {
        mostrar("Não foi possível falar com o servidor. Confira a conexão e tente de novo.", "erro");
        botao.disabled = false;
        botao.textContent = "Enviar";
      }
    });

    // Tirar o estado de erro assim que a pessoa começa a corrigir.
    [form.nome, form.email].forEach(function (campo) {
      campo.addEventListener("input", function () {
        if (campo.classList.contains("is-erro") && campo.value.trim()) {
          marcarErro(campo, false);
        }
      });
    });
  }

  var ano = document.getElementById("lpAno");
  if (ano) ano.textContent = String(new Date().getFullYear());
})();
