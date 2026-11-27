// Maquete da tela de Atendimento (27/11/2026). Ver _atendimento-preview.html.
// Dados de exemplo. Sem crase dentro dos templates (ver CLAUDE.md).
(function () {
  var H = 3600e3, D = 24 * H, agora = Date.now();
  var CH = [
    { id: 10, predio: "Residencial Aurora", tit: "Falta de água no bloco B", p: "p1", canal: "wa", cat: "Sem água", criado: agora - 3 * D, tec: null, fora: true, primeira: "em 12 min",
      desc: "Moradores sem água desde as 7h. Síndica diz que a bomba 2 faz barulho e desliga sozinha.",
      cliente: "Márcia (síndica) · (11) 98765-4321", conversa: true },
    { id: 11, predio: "Residencial Aurora", tit: "Bomba 2 fazendo ruído alto", p: "p2", canal: "", cat: "Bomba", criado: agora - 29 * D, tec: "Carlos Técnico", caminho: agora - 40 * 60e3, fora: false, primeira: "em 30 min",
      desc: "Zelador relatou ruído metálico na bomba 2 do barrilete." },
    { id: 12, predio: "Edifício Monte Azul", tit: "Vazamento no barrilete do 3º andar", p: "p2", canal: "", cat: "Vazamento", criado: agora - 5 * H, tec: "Téc Outro", fora: false, primeira: "em 8 min",
      desc: "Água escorrendo pela parede do hall do 3º andar, perto do shaft.", turno: "Cliente ligou de novo, ir hoje antes das 16h." },
    { id: 13, predio: "Residencial Aurora", tit: "Dispositivo offline: Caixa Superior 1", p: "p2", canal: "sensor", cat: "Telemetria", criado: agora - 10 * D, tec: null, fora: true, primeira: "não houve",
      desc: "A telemetria parou de mandar leitura da Caixa Superior 1." },
    { id: 14, predio: "Edifício Sem Telemetria", tit: "Portão da garagem não fecha", p: "p3", canal: "", cat: "Outros", criado: agora - 2 * D, tec: null, fora: false, primeira: "aguardando",
      desc: "Pedido do síndico, fora do escopo de bombas: avaliar se é nosso." },
    { id: 15, predio: "Condomínio Jardim das Flores", tit: "Preventiva mensal — novembro/26", p: "p4", canal: "prev", cat: "Preventiva", criado: agora - 7 * D, tec: "Carlos Técnico", fora: false, primeira: "—", preventiva: true,
      desc: "Visita mensal do contrato." },
    { id: 9, predio: "Edifício Monte Azul", tit: "Boia da cisterna travada", p: "p2", canal: "wa", cat: "Boia", criado: agora - 6 * D, fechado: agora - 4 * D, tec: "Carlos Técnico", resolvido: true, primeira: "em 5 min",
      desc: "Cisterna transbordando pelo ladrão.", aval: { n: 5, txt: "Resolveram no mesmo dia, obrigado!" } },
  ];
  var CHIPS = [
    ["abertos", "Em aberto", function (c) { return !c.resolvido && !c.preventiva; }],
    ["semtec", "Sem técnico", function (c) { return !c.resolvido && !c.tec && !c.preventiva; }],
    ["prazo", "Fora do prazo", function (c) { return !c.resolvido && c.fora; }, true],
    ["p1", "P1", function (c) { return !c.resolvido && c.p === "p1"; }, true],
  ];
  var MAIS = [
    ["prev", "Preventivas", function (c) { return !c.resolvido && c.preventiva; }],
    ["resolvidos", "Resolvidos", function (c) { return c.resolvido; }],
    ["cancelados", "Cancelados", function () { return false; }],
    ["todos", "Todos", function () { return true; }],
  ];
  var st = { visao: "abertos", sel: 10, aba: "chamado", busca: "" };
  var $ = function (id) { return document.getElementById(id); };
  var ico = function (n, c) { return '<i data-lucide="' + n + '"' + (c ? ' class="' + c + '"' : "") + '></i>'; };
  var rel = function (t) { var s = (agora - t) / 1000; if (s < 3600) return Math.max(1, Math.floor(s / 60)) + " min"; if (s < 86400) return Math.floor(s / 3600) + " h"; return Math.floor(s / 86400) + " d"; };
  var data = function (t) { var d = new Date(t); return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); };
  var curto = function (n) { var p = n.split(" "); return p[0] + (p[1] ? " " + p[1][0] + "." : ""); };
  var ini = function (n) { return n.split(" ").slice(0, 2).map(function (x) { return x[0]; }).join("").toUpperCase(); };
  var todas = CHIPS.concat(MAIS);
  var filtro = function (k) { return (todas.find(function (v) { return v[0] === k; }) || CHIPS[0])[2]; };

  function fila() {
    var naMais = MAIS.find(function (v) { return v[0] === st.visao; });
    $("chips").innerHTML = CHIPS.map(function (v) {
      var n = CH.filter(v[2]).length;
      if (!n && v[3] && st.visao !== v[0]) return "";
      return '<button type="button" class="pv-chip' + (st.visao === v[0] ? " is-on" : "") + '" data-visao="' + v[0] + '">' + (v[3] && n ? '<i class="pt"></i>' : "") + v[1] + " <em>" + n + "</em></button>";
    }).join("") +
      '<button type="button" class="pv-chip' + (naMais ? " is-on" : "") + '" data-mais>' + (naMais ? naMais[1] + " <em>" + CH.filter(naMais[2]).length + "</em>" : "Mais") + ico("chevron-down") + "</button>" +
      '<div class="pv-mais" id="mais" hidden>' + MAIS.map(function (v) { return '<button type="button" data-visao="' + v[0] + '">' + v[1] + " <em>" + CH.filter(v[2]).length + "</em></button>"; }).join("") + "</div>";

    var q = st.busca.toLowerCase();
    var lista = CH.filter(filtro(st.visao)).filter(function (c) { return !q || (c.predio + " " + c.tit + " " + c.id).toLowerCase().indexOf(q) >= 0; });
    lista.sort(function (a, b) { return (b.fora - a.fora) || a.p.localeCompare(b.p) || a.criado - b.criado; });
    $("itens").innerHTML = lista.map(function (c) {
      var canal = c.canal === "wa" ? ico("message-circle", "wa") : c.canal === "sensor" ? ico("radio-tower", "sensor") : c.canal === "prev" ? ico("repeat") : "";
      var sit;
      if (c.resolvido) sit = '<span class="pv-sit is-ok">resolvido há ' + rel(c.fechado) + "</span>";
      else if (c.fora) sit = '<span class="pv-sit is-ri">' + ico("clock") + "fora do prazo</span>";
      else if (c.caminho) sit = '<span class="pv-sit is-in">técnico a caminho</span>';
      else sit = "<span>aberto</span>";
      var tec = c.tec ? '<span class="pv-tec">' + curto(c.tec) + "</span>" : (c.resolvido ? "" : '<span class="pv-tec is-sem">sem técnico</span>');
      return '<div class="pv-item' + (st.sel === c.id ? " is-sel" : "") + '" data-ch="' + c.id + '" tabindex="0">' +
        '<div class="pv-l1"><span class="pv-predio">' + canal + "<span>" + c.predio + "</span></span><time>" + rel(c.criado) + "</time></div>" +
        '<span class="pv-tit">' + c.tit + "</span>" +
        '<div class="pv-l3"><span class="pv-p is-' + c.p + '">' + c.p.toUpperCase() + "</span>" + sit + tec + "</div></div>";
    }).join("") || '<div class="pv-vazio">' + ico("circle-check") + "<b>Fila limpa.</b><span>Nenhum chamado esperando aqui agora.</span></div>";
  }

  function tempo(c) {
    var e = [
      ["Aberto", c.criado], ["Técnico a caminho", c.caminho], ["Técnico chegou", c.chegou], ["Resolvido", c.fechado],
    ];
    var atual = c.resolvido ? -1 : e.findIndex(function (x) { return !x[1]; });
    return '<ol class="pv-tempo">' + e.map(function (x, i) {
      var cls = x[1] ? "is-feito" : i === atual ? "is-atual" : "";
      var q = x[1] ? data(x[1]) : c.resolvido ? "não registrado" : i === atual ? "a seguir" : "";
      return '<li class="' + cls + '"><b>' + x[0] + "</b><span>" + q + "</span></li>";
    }).join("") + "</ol>";
  }

  function chamado(c) {
    var canal = c.canal === "wa" ? ico("message-circle") + "WhatsApp" : c.canal === "sensor" ? ico("radio-tower") + "Alerta da telemetria" : c.canal === "prev" ? ico("repeat") + "Preventiva" : ico("building") + "Aberto pelo escritório";
    var prio = { p1: "P1 · Crítico", p2: "P2 · Alta", p3: "P3 · Normal", p4: "P4 · Baixa" }[c.p];
    var acoes = c.resolvido
      ? '<button type="button" class="pv-bt">Reabrir</button>'
      : '<button type="button" class="pv-bt is-pri">' + ico("check") + 'Marcar como resolvido</button>';
    var menu = '<div class="pv-menu" id="menu" hidden>' +
      '<button type="button">' + ico("external-link") + "Abrir em página própria</button>" +
      (c.resolvido ? "" : '<button type="button">' + ico("flag") + "Marcar para o turno</button>") +
      '<button type="button">' + ico("arrow-up-down") + "Mudar a prioridade</button>" +
      (c.resolvido ? "" : '<hr><button type="button" class="is-perigo">' + ico("x") + "Cancelar chamado</button>") + "</div>";

    var faixa = "";
    if (c.resolvido) faixa = '<div class="pv-faixa is-ok">' + ico("circle-check") + "<div><b>Resolvido em " + data(c.fechado) + "</b> <span>por " + c.tec + ", " + Math.round((c.fechado - c.criado) / D) + " d depois de aberto.</span></div></div>";
    else if (c.fora) faixa = '<div class="pv-faixa is-ri">' + ico("clock") + "<div><b>Fora do prazo de solução.</b> <span>Aberto há " + rel(c.criado) + ", o limite era de 24 h." + (c.tec ? "" : " E ainda ninguém está com ele.") + "</span></div></div>";
    else if (!c.tec && !c.preventiva) faixa = '<div class="pv-faixa is-at">' + ico("user-x") + "<div><b>Ninguém está com ele.</b> <span>Atribua um técnico para começar a contar o atendimento.</span></div></div>";

    var turno = c.resolvido ? "" : c.turno
      ? '<div class="pv-turno is-marcado">' + ico("flag") + "<div><b>Pedido do escritório para o turno</b>" + c.turno + "<br><small>Admin Teste · hoje 10:12</small></div><button type=\"button\" class=\"pv-bt is-fio\">Retirar</button></div>"
      : "";

    var trecho = c.conversa
      ? '<div class="pv-sec"><h3>Como chegou</h3><div class="pv-trecho">' +
        '<div class="pv-bolha">Bom dia, estamos sem água no bloco B desde cedo<small>Márcia · 07:42</small></div>' +
        '<div class="pv-bolha eu">Bom dia, Márcia. Já abri o chamado e vou passar para a equipe técnica.<small>IA · 07:43</small></div>' +
        '<div class="pv-bolha">A bomba 2 está fazendo barulho e desligando<small>Márcia · 07:45</small></div>' +
        '</div><button type="button" class="pv-link pv-hist-mais" data-aba="conversa">Ver a conversa inteira →</button></div>'
      : "";

    var hist = [
      ["<b>Admin Teste</b> trocou o técnico de <b>Carlos Técnico</b> para <b>Téc Outro</b>", "20/11 01:42"],
      ["<b>Admin Teste</b> tirou o técnico <b>Téc Outro</b>", "19/11 18:08"],
      ["<b>Admin Teste</b> subiu a prioridade de P2 para <b>P1</b>", "19/11 18:07"],
      c.conversa ? ["<b>IA do WhatsApp</b> abriu o chamado pela conversa com Márcia", data(c.criado)] : ["<b>Admin Teste</b> abriu o chamado", data(c.criado)],
    ];
    var aval = c.aval ? '<div class="pv-sec"><h3>Avaliação do cliente</h3><div class="pv-aval"><span class="est">★★★★★</span><b>' + c.aval.n + ' de 5</b><q>' + c.aval.txt + "</q></div></div>" : "";

    var tecDd = c.tec
      ? '<dd><span class="pv-av">' + ini(c.tec) + "</span>" + c.tec + "</dd>"
      : '<dd><span class="pv-ninguem">Ninguém ainda</span></dd><dd><button type="button" class="pv-bt" style="margin-top:4px">' + ico("user-plus") + "Atribuir técnico</button></dd>";
    var lado =
      '<dl class="pv-dl">' +
        "<div><dt>Técnico" + (c.tec && !c.resolvido ? '<button type="button" class="pv-link">Trocar</button>' : "") + "</dt>" + tecDd + "</div>" +
        '<div><dt>Condomínio<button type="button" class="pv-link">Trocar</button></dt><dd>' + c.predio + "</dd></div>" +
        (c.cliente ? "<div><dt>Quem pediu</dt><dd>" + c.cliente + "</dd></div>" : "") +
        "<div><dt>Primeira resposta</dt><dd>" + c.primeira + "</dd></div>" +
      "</dl>" +
      (c.predio === "Edifício Sem Telemetria" ? "" :
      '<div class="pv-sec"><h3>O prédio agora</h3><div class="pv-res">' +
        '<div>Caixa Superior 1<span>—</span><i style="--p:0%"></i><small>sem leitura há 10 d</small></div>' +
        '<div>Caixa Superior 2<span>34%</span><i style="--p:34%;--c:var(--at)"></i><small>bomba ligada</small></div>' +
        '<div>Cisterna<span>8%</span><i style="--p:8%;--c:var(--ri)"></i><small>bomba desligada</small></div>' +
        '<div>Reserva de incêndio<span>70%</span><i style="--p:70%"></i></div>' +
      '</div><button type="button" class="pv-link" style="margin-top:12px">Abrir a ficha do condomínio →</button></div>');

    return '<div class="pv-ch"><div class="pv-ch-corpo">' +
      '<div><div class="pv-ch-cab">' +
        '<div class="pv-ch-id"><code>CH-' + String(c.id).padStart(4, "0") + '</code>·<span class="pv-canal">' + canal + "</span>·<span>aberto há " + rel(c.criado) + "</span></div>" +
        '<div class="pv-ch-acoes"><button type="button" class="pv-bt is-ico" data-menu aria-label="Mais ações">' + ico("ellipsis") + "</button>" + menu + "</div></div>" +
        "<h2>" + c.tit + "</h2>" +
        '<div class="pv-ch-sub"><span class="pv-p is-' + c.p + '">' + prio + '</span><button type="button" class="pv-link">' + c.predio + "</button><span>" + c.cat + "</span></div>" +
        '<div class="pv-ch-acoes" style="margin-top:14px">' + acoes + "</div>" +
      "</div>" +
      faixa + tempo(c) + turno +
      '<div class="pv-sec"><h3>O que está acontecendo</h3><p>' + c.desc + "</p></div>" +
      trecho + aval +
      '<div class="pv-sec"><h3>Histórico</h3><ul class="pv-hist">' + hist.map(function (h) { return "<li><div>" + h[0] + "<small>" + h[1] + "</small></div></li>"; }).join("") + '</ul><button type="button" class="pv-link pv-hist-mais">Ver tudo (9)</button></div>' +
    '</div><aside class="pv-ch-lado">' + lado + "</aside></div>";
  }

  function conversa() {
    return '<div class="pv-wa"><div class="pv-wa-msgs">' +
      '<span class="pv-ia">Conversa com Márcia · (11) 98765-4321 · a IA atendeu primeiro</span>' +
      '<div class="pv-bolha">Bom dia, estamos sem água no bloco B desde cedo<small>07:42</small></div>' +
      '<div class="pv-bolha eu">Bom dia, Márcia. Já abri o chamado e vou passar para a equipe técnica.<small>IA · 07:43</small></div>' +
      '<div class="pv-bolha">A bomba 2 está fazendo barulho e desligando<small>07:45</small></div>' +
      '<div class="pv-bolha eu">Anotado. Assim que um técnico estiver a caminho eu aviso por aqui.<small>IA · 07:45</small></div>' +
      '<div class="pv-bolha">Alguém vem hoje?<small>11:20</small></div>' +
      '</div><div class="pv-wa-escrever"><input placeholder="Responder como General"><button type="button" class="pv-bt is-pri">' + ico("send") + "Enviar</button></div></div>";
  }

  function centro() {
    var c = CH.find(function (x) { return x.id === st.sel; });
    var abas = $("abas");
    if (!c) { abas.hidden = true; $("palco").innerHTML = '<div class="pv-vazio">' + ico("inbox") + "<b>Escolha um chamado</b><span>Ele aparece aqui inteiro.</span></div>"; return; }
    abas.hidden = !c.conversa;
    abas.innerHTML = '<button type="button" data-aba="chamado" class="' + (st.aba === "chamado" ? "is-on" : "") + '">' + ico("inbox") + 'Chamado</button><button type="button" data-aba="conversa" class="' + (st.aba === "conversa" ? "is-on" : "") + '">' + ico("message-circle") + "Conversa no WhatsApp <em>1</em></button>";
    $("palco").innerHTML = c.conversa && st.aba === "conversa" ? conversa() : chamado(c);
    $("palco").scrollTop = 0;
  }

  function tudo() { fila(); centro(); lucide.createIcons(); }

  document.addEventListener("click", function (e) {
    var t = e.target, el;
    if ((el = t.closest("[data-mais]"))) { $("mais").hidden = !$("mais").hidden; return; }
    if ((el = t.closest("[data-menu]"))) { $("menu").hidden = !$("menu").hidden; return; }
    if ((el = t.closest("[data-visao]"))) { st.visao = el.dataset.visao; tudo(); return; }
    if ((el = t.closest("[data-ch]"))) { st.sel = Number(el.dataset.ch); st.aba = "chamado"; $("caixa").classList.add("com-item"); tudo(); return; }
    if ((el = t.closest("[data-aba]"))) { st.aba = el.dataset.aba; centro(); lucide.createIcons(); return; }
    if (t.closest("[data-voltar]")) { $("caixa").classList.remove("com-item"); return; }
    if (t.closest("#notasBt")) { $("notas").hidden = !$("notas").hidden; return; }
    var m = $("mais"); if (m && !t.closest(".pv-mais")) m.hidden = true;
    var mn = $("menu"); if (mn && !t.closest(".pv-menu")) mn.hidden = true;
  });
  $("busca").addEventListener("input", function (e) { st.busca = e.target.value; fila(); lucide.createIcons(); });
  tudo();
})();
