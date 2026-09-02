// condo-picker.js — o campo de escolher prédio, com busca.
//
// ⚠️ ARQUIVO COMPARTILHADO ENTRE PAINÉIS, no molde do `inatividade.js`: ele é
// carregado por `admin.html` e por `operador.html`. Isso NÃO viola a regra de
// que "`operador.js` não importa nada de `admin.js`" (ver painel-operador.md) —
// a regra existe para o operador não virar refém do admin, e um terceiro
// arquivo sem dono é justamente o contrário disso. Só o CSS é duplicado nas
// duas folhas, como todo o resto do sistema Chapa.
//
// ── O QUE ELE SUBSTITUI ──────────────────────────────────────────────────
// Um `<select>` nativo com a carteira inteira dentro. Em produção são **86
// prédios**, e o `<select>` não tem busca: sobra rolar a lista, ou a
// digitação-por-prefixo do navegador, que casa só o COMEÇO do texto e se perde
// a cada tecla lenta. Achar "Auri Faria Lima" numa lista ordenada por razão
// social é procurar por um nome que não está escrito.
//
// ⚠️ E É POR ISSO QUE ELE BUSCA NOS DOIS NOMES. Desde a migration 044 o nome de
// exibição é o FANTASIA e `condominios.nome` é a razão social — em produção 71
// dos 86 cadastros têm os dois diferentes. Quem atende o telefone ouve um dos
// dois, sem saber qual: "Elvira Ferraz" (o do CNPJ) e "Auri Faria Lima" (o da
// porta) são o mesmo prédio. Buscar só no que está escrito na tela deixaria
// metade das ligações sem resposta. Bairro e cidade entram junto porque "aquele
// da Vila Mariana" também é como se pergunta.
//
// ⚠️ SEM ACENTO E SEM CAIXA. "sao caetano" acha "São Caetano". Numa tela usada
// com o telefone no ombro, exigir o acento certo é exigir uma segunda tentativa.
(function () {
  "use strict";

  // "Condomínio Édis" vira "condominio edis". `NFD` separa a letra do acento,
  // e U+0300–U+036F é a faixa dos diacríticos combinantes que sobram.
  //
  // ⚠️ A FAIXA VAI ESCAPADA, não com os acentos literais dentro dos colchetes.
  // Um diacrítico combinante solto numa regex é invisível no editor (ele se
  // pendura na letra anterior), e qualquer ferramenta que reescreva o arquivo
  // pode normalizá-lo e mudar a faixa sem ninguém ver.
  var RE_ACENTO = /[\u0300-\u036f]/g;

  function normalizar(s) {
    return String(s == null ? "" : s)
      .normalize("NFD").replace(RE_ACENTO, "")
      .toLowerCase().trim();
  }

  function escapar(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // O nome que se mostra. Mesma expressão canônica do backend — `NULLIF` porque
  // fantasia salvo como string vazia apagaria o nome da linha.
  function nomeDe(c)  { return (c.nome_fantasia || "").trim() || c.nome || "—"; }
  function razaoDe(c) { return (c.nome || "").trim(); }

  /**
   * Monta o picker em cima de um campo que já existe.
   *
   * ⚠️ O CAMPO ORIGINAL NÃO SOME — ele vira `<input type="hidden">` com o MESMO
   * id. Todo o código de envio que já existia (`getElementById("ncCondo").value`)
   * continua valendo, sem uma linha de mudança. É o que torna esta troca segura
   * numa tela que grava chamado.
   */
  function montar(opcoes) {
    var campoId  = opcoes.campo;
    var itens    = opcoes.itens || [];
    var original = document.getElementById(campoId);
    if (!original) return null;

    // Já montado? Só troca a lista (a carteira pode ter carregado depois).
    if (original.dataset.pickerPronto === "1") {
      original._pickerAtualizar(itens);
      return original._picker;
    }

    var permiteVazio = opcoes.permiteVazio !== false;
    var rotuloVazio  = opcoes.rotuloVazio || "Sem condomínio";
    var placeholder  = opcoes.placeholder || "Buscar por nome, bairro ou cidade…";

    // O original vira depósito do valor, no lugar onde já estava.
    var valorAtual = original.value || "";
    var hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.id = campoId;
    hidden.value = valorAtual;
    original.removeAttribute("id");
    original.style.display = "none";

    var caixa = document.createElement("div");
    caixa.className = "cbx";

    var listaId = "cbxLista_" + campoId;
    caixa.innerHTML =
      '<input type="text" class="input cbx-campo" role="combobox" autocomplete="off"' +
      ' aria-expanded="false" aria-autocomplete="list" aria-controls="' + listaId + '"' +
      ' placeholder="' + escapar(placeholder) + '">' +
      '<button type="button" class="cbx-limpar" aria-label="Limpar" hidden>&times;</button>' +
      '<ul class="cbx-lista" id="' + listaId + '" role="listbox" hidden></ul>';

    original.parentNode.insertBefore(caixa, original);
    caixa.appendChild(hidden);

    var campo  = caixa.querySelector(".cbx-campo");
    var lista  = caixa.querySelector(".cbx-lista");
    var limpar = caixa.querySelector(".cbx-limpar");

    var filtrados = [];
    var marcado = -1;   // índice destacado pelo teclado

    function achar(id) {
      for (var i = 0; i < itens.length; i++) {
        if (String(itens[i].id) === String(id)) return itens[i];
      }
      return null;
    }

    function filtrar(termo) {
      var q = normalizar(termo);
      if (!q) return itens.slice();
      // ⚠️ TODOS OS TERMOS PRECISAM CASAR, em qualquer ordem e em qualquer
      // campo: "mariana vila" acha "Residencial Vila Mariana". Buscar a frase
      // inteira obrigaria a lembrar a ordem exata das palavras.
      var termos = q.split(/\s+/);
      return itens.filter(function (c) {
        var alvo = normalizar(
          nomeDe(c) + " " + razaoDe(c) + " " + (c.bairro || "") + " " + (c.cidade || "")
        );
        for (var i = 0; i < termos.length; i++) {
          if (alvo.indexOf(termos[i]) === -1) return false;
        }
        return true;
      });
    }

    function desenhar(termo) {
      filtrados = filtrar(termo);
      marcado = filtrados.length ? 0 : -1;

      if (!filtrados.length) {
        lista.innerHTML =
          '<li class="cbx-vazio" role="presentation">Nenhum prédio com esse nome.' +
          (permiteVazio ? " Dá para seguir sem prédio." : "") + "</li>";
        return;
      }

      var html = "";
      if (permiteVazio && !normalizar(termo)) {
        html += '<li class="cbx-item cbx-item-vazio" role="option" data-id="" data-i="-1">' +
                '<span class="cbx-nome">' + escapar(rotuloVazio) + "</span></li>";
      }
      html += filtrados.map(function (c, i) {
        var nome  = nomeDe(c);
        var razao = razaoDe(c);
        var onde  = [c.bairro, c.cidade].filter(Boolean).join(" · ");
        // ⚠️ A RAZÃO SOCIAL SÓ APARECE QUANDO DIFERE do nome exibido. Para quem
        // não tem fantasia cadastrado os dois são o mesmo texto, e repetir a
        // linha seria ruído. Quando difere, ela é o que faz a busca por "o nome
        // do CNPJ" ter sentido — e precisa estar visível, senão o resultado
        // parece não ter relação com o que se digitou.
        var sub = [];
        if (razao && normalizar(razao) !== normalizar(nome)) sub.push(escapar(razao));
        if (onde) sub.push(escapar(onde));
        return '<li class="cbx-item" role="option" data-id="' + escapar(c.id) + '" data-i="' + i + '"' +
               (i === 0 ? ' aria-selected="true"' : "") + ">" +
               '<span class="cbx-nome">' + escapar(nome) + "</span>" +
               (sub.length ? '<span class="cbx-sub">' + sub.join(" · ") + "</span>" : "") +
               "</li>";
      }).join("");
      lista.innerHTML = html;
      realcar();
    }

    function realcar() {
      var els = lista.querySelectorAll(".cbx-item");
      for (var i = 0; i < els.length; i++) {
        var ativo = String(els[i].dataset.i) === String(marcado);
        els[i].classList.toggle("is-marcado", ativo);
        els[i].setAttribute("aria-selected", ativo ? "true" : "false");
        // `block: nearest` para a lista não saltar quando o item já está à vista.
        if (ativo && els[i].scrollIntoView) els[i].scrollIntoView({ block: "nearest" });
      }
    }

    function abrir(termo) {
      desenhar(termo === undefined ? campo.value : termo);
      lista.hidden = false;
      campo.setAttribute("aria-expanded", "true");
    }

    function fechar() {
      lista.hidden = true;
      campo.setAttribute("aria-expanded", "false");
      marcado = -1;
    }

    function escolher(id) {
      hidden.value = id == null ? "" : String(id);
      var c = achar(hidden.value);
      campo.value = c ? nomeDe(c) : "";
      limpar.hidden = !hidden.value;
      fechar();
      // Quem escutava `change` no `<select>` continua sendo avisado.
      hidden.dispatchEvent(new Event("change", { bubbles: true }));
    }

    campo.addEventListener("input", function () {
      // Digitar desfaz a escolha: o texto no campo deixou de ser um prédio.
      if (hidden.value) { hidden.value = ""; limpar.hidden = true; }
      abrir();
    });

    campo.addEventListener("focus", function () { abrir(); });

    campo.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (lista.hidden) { abrir(); return; }
        var n = filtrados.length;
        if (!n) return;
        marcado = e.key === "ArrowDown"
          ? (marcado + 1) % n
          : (marcado <= 0 ? n - 1 : marcado - 1);
        realcar();
        return;
      }
      if (e.key === "Enter") {
        // ⚠️ `preventDefault` SÓ com a lista aberta: fora dela o Enter é do
        // formulário, e roubá-lo impediria de salvar pelo teclado.
        if (!lista.hidden && marcado >= 0 && filtrados[marcado]) {
          e.preventDefault();
          escolher(filtrados[marcado].id);
        }
        return;
      }
      if (e.key === "Escape") {
        if (!lista.hidden) { e.stopPropagation(); fechar(); }
        return;
      }
      if (e.key === "Tab") fechar();
    });

    lista.addEventListener("mousedown", function (e) {
      // `mousedown` e não `click`: o `blur` do campo chegaria primeiro e
      // fecharia a lista antes de o clique existir.
      var li = e.target.closest(".cbx-item");
      if (!li) return;
      e.preventDefault();
      escolher(li.dataset.id || "");
    });

    campo.addEventListener("blur", function () {
      // Sai do campo com texto que não é prédio nenhum: limpa, para a tela
      // nunca mostrar um nome que não corresponde ao valor gravado.
      setTimeout(function () {
        if (!hidden.value) campo.value = "";
        fechar();
      }, 120);
    });

    limpar.addEventListener("click", function () {
      escolher("");
      campo.focus();
    });

    original._picker = {
      valor: function () { return hidden.value; },
      definir: function (id) { escolher(id); },
      limpar: function () { escolher(""); },
      foco: function () { campo.focus(); },
    };
    original._pickerAtualizar = function (novos) {
      itens = novos || [];
      if (hidden.value && !achar(hidden.value)) escolher("");
    };
    original.dataset.pickerPronto = "1";

    if (valorAtual) escolher(valorAtual);
    return original._picker;
  }

  window.CondoPicker = { montar: montar, nomeDe: nomeDe };
})();
