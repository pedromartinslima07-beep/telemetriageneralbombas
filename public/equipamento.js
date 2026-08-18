// Ficha do equipamento — o que a etiqueta QR abre (/e/:codigo).
//
// A tela responde "o que aconteceu com essa bomba agora" e oferece UMA ação.
// Quem está aqui tem a bomba na frente e uma mão ocupada: identidade, tempo no
// estado e relato ocupam a primeira tela; dados, fotos e histórico são
// referência abaixo. Ver o contrato de direção no topo de equipamento.html.
//
// Dois modos, decididos pelo backend:
//   • etiqueta livre  → formulário curto de vínculo (o técnico acabou de colar)
//   • já vinculada    → a decisão + referência
//
// Página autônoma: carrega admin.css pelos tokens, mas não usa nada de admin.js.

(function () {
  "use strict";

  const $root = document.getElementById("eqRoot");
  const $topoCod = document.getElementById("eqTopoCodigo");

  // ---------------------------------------------------------------------
  // Sessão
  // ---------------------------------------------------------------------

  // Mesma normalização do backend (Crockford): quem digita o código à mão da
  // etiqueta suja confunde I/L com 1 e O com 0.
  function normalizarCodigo(s) {
    return String(s || "").toUpperCase().replace(/[^0-9A-Z]/g, "")
      .replace(/[IL]/g, "1").replace(/O/g, "0").replace(/U/g, "V");
  }

  const CODIGO = normalizarCodigo(decodeURIComponent(location.pathname.split("/e/")[1] || ""));

  function formatarCodigo(c) {
    return c && c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : (c || "—");
  }

  function token() { return localStorage.getItem("token"); }

  // `next` devolve o técnico para ESTA bomba depois do login. Sem isso ele
  // escaneia, cai no login, entra — e vai parar no painel.
  function irParaLogin(motivo) {
    const next = encodeURIComponent(`/e/${CODIGO}`);
    location.href = `/login?next=${next}${motivo ? `&motivo=${motivo}` : ""}`;
  }

  async function api(caminho, opcoes = {}) {
    const resp = await fetch(caminho, {
      ...opcoes,
      headers: {
        ...(opcoes.body ? { "Content-Type": "application/json" } : {}),
        Authorization: "Bearer " + token(),
        ...(opcoes.headers || {}),
      },
    });
    if (resp.status === 401) { irParaLogin("expirado"); throw new Error("sessão expirada"); }

    // Erro fora das rotas (413, 404 do Express, 502 do proxy) responde HTML —
    // `.json()` direto viraria "Unexpected token '<'" e esconderia a causa.
    const txt = await resp.text();
    let dados = {};
    try { dados = txt ? JSON.parse(txt) : {}; }
    catch (_) { throw new Error(`Resposta inesperada do servidor (HTTP ${resp.status}).`); }
    if (!resp.ok) {
      const e = new Error(dados.error || `Erro ${resp.status}`);
      e.status = resp.status;
      throw e;
    }
    return dados;
  }

  // ---------------------------------------------------------------------
  // Exibição
  // ---------------------------------------------------------------------

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function dataHora(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
      + " · " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  function diasDesde(iso) {
    if (!iso) return null;
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  }

  /** "hoje" · "há 1 dia" · "há 12 dias" · "há 3 meses" */
  function faz(dias) {
    if (dias == null) return "";
    if (dias <= 0) return "desde hoje";
    if (dias === 1) return "há 1 dia";
    if (dias < 60) return `há ${dias} dias`;
    const meses = Math.round(dias / 30);
    return `há ${meses} meses`;
  }

  // Frase do estado. O verbo muda com o estado porque a pergunta muda: na
  // oficina interessa há quanto tempo está parada; no prédio, desde quando voltou.
  const ESTADO_FRASE = {
    instalado:            "No condomínio",
    oficina:              "Na oficina",
    aguardando_orcamento: "Aguardando orçamento",
    aguardando_peca:      "Aguardando peça",
    em_conserto:          "Em conserto",
    pronto:               "Pronta para devolver",
    devolvido:            "Devolvida",
    baixado:              "Baixada",
    etiqueta_livre:       "Etiqueta em branco",
  };

  const MOV_LABEL = {
    cadastro:             "Cadastrada no sistema",
    retirada:             "Retirada do condomínio",
    entrada_oficina:      "Chegou na oficina",
    diagnostico:          "Diagnóstico",
    orcamento_solicitado: "Orçamento solicitado",
    orcamento_aprovado:   "Orçamento aprovado",
    em_conserto:          "Entrou em conserto",
    aguardando_peca:      "Aguardando peça",
    pronto:               "Conserto concluído",
    devolucao:            "Devolvida ao condomínio",
    anotacao:             "Anotação",
    baixa:                "Baixa",
  };

  // Movimentações que viram o ciclo ganham ponto aceso na linha do tempo.
  const MARCOS = new Set(["retirada", "devolucao", "baixa", "cadastro"]);
  const TIPOS = ["bomba", "motor", "painel", "quadro", "boia", "outro"];

  // O trilho: o caminho que a bomba realmente percorre.
  const PARADAS = ["No prédio", "Oficina", "Pronta", "Devolvida"];
  const PARADA_POR_STATUS = {
    instalado: 0, oficina: 1, aguardando_orcamento: 1, aguardando_peca: 1,
    em_conserto: 1, pronto: 2, devolvido: 3,
  };

  const PIXEL_VAZIO = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

  const ICONE_ALERTA = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;

  const ICONE_CHEVRON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`;

  function enderecoDe(eq) {
    return [eq.condominio_endereco, eq.condominio_bairro,
            [eq.condominio_cidade, eq.condominio_uf].filter(Boolean).join("/")]
      .filter(Boolean).join(" · ");
  }

  function nomeEquipamento(eq) {
    if (eq.apelido) return eq.apelido;
    const marca = [eq.marca, eq.modelo].filter(Boolean).join(" ");
    if (marca) return marca;
    return eq.tipo ? eq.tipo[0].toUpperCase() + eq.tipo.slice(1) : "Equipamento";
  }

  // ---------------------------------------------------------------------
  // Foto: comprime ANTES de subir
  // ---------------------------------------------------------------------

  // Foto de celular tem 4-8 MB; em base64 infla ~33% e estoura o limite de 8mb
  // do express.json — o mesmo erro que já mordeu na assinatura de e-mail e nas
  // fotos da O.S.
  function comprimirImagem(file, maxLado = 1280, qualidade = 0.75) {
    return new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onerror = () => reject(new Error("não foi possível ler a imagem"));
      leitor.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("arquivo não é uma imagem válida"));
        img.onload = () => {
          const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
          const cv = document.createElement("canvas");
          cv.width = Math.round(img.width * escala);
          cv.height = Math.round(img.height * escala);
          cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
          resolve(cv.toDataURL("image/jpeg", qualidade));
        };
        img.src = leitor.result;
      };
      leitor.readAsDataURL(file);
    });
  }

  // ---------------------------------------------------------------------
  // Telas
  // ---------------------------------------------------------------------

  function telaErro(titulo, texto) {
    $root.innerHTML = `<div class="eq-erro"><h2>${esc(titulo)}</h2><p>${texto}</p></div>`;
  }

  let _condominios = null;
  async function condominios() {
    if (!_condominios) _condominios = await api("/equipamentos/condominios");
    return _condominios;
  }

  /** Etiqueta em branco: o técnico acabou de colar na bomba. */
  async function telaVincular(eq) {
    let lista = [];
    try { lista = await condominios(); }
    catch (e) { telaErro("Não consegui carregar os condomínios", esc(e.message)); return; }

    $root.innerHTML = `
      <div class="eq-decisao">
        <h1 class="eq-vinc-titulo">Etiqueta ${formatarCodigo(eq.codigo)} ainda não tem equipamento</h1>
        <p class="eq-vinc-lede">
          Preencha o mínimo agora, com a bomba na mão. O resto dá para completar depois.
        </p>
      </div>

      <form class="eq-secao" id="eqFormVinc">
        <div class="eq-campo">
          <label for="fCondo">Condomínio *</label>
          <select id="fCondo" required>
            <option value="">Selecione…</option>
            ${lista.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join("")}
          </select>
        </div>

        <div class="eq-campo-dupla">
          <div class="eq-campo">
            <label for="fTipo">Tipo</label>
            <select id="fTipo">
              ${TIPOS.map(t => `<option value="${t}">${t[0].toUpperCase() + t.slice(1)}</option>`).join("")}
            </select>
          </div>
          <div class="eq-campo">
            <label for="fApelido">Identificação</label>
            <input id="fApelido" placeholder="Bomba 2 — recalque" maxlength="120">
          </div>
        </div>

        <div class="eq-campo">
          <label for="fLocal">Onde fica no prédio</label>
          <input id="fLocal" placeholder="Casa de máquinas, ao lado do quadro" maxlength="200">
        </div>

        <div class="eq-campo">
          <label for="fDefeito">Qual é o problema</label>
          <textarea id="fDefeito" placeholder="Não liga. Zelador diz que parou depois da chuva de sábado."></textarea>
        </div>

        <div class="eq-campo-dupla">
          <div class="eq-campo">
            <label for="fMarca">Marca</label>
            <input id="fMarca" maxlength="120">
          </div>
          <div class="eq-campo">
            <label for="fModelo">Modelo</label>
            <input id="fModelo" maxlength="120">
          </div>
        </div>

        <div class="eq-campo">
          <label for="fSerie">Número de série</label>
          <input id="fSerie" maxlength="120">
        </div>

        <p class="eq-aviso eq-acao-erro" id="eqVincErro"></p>

        <div class="eq-vinc-acoes">
          <button type="submit" class="eq-acao-principal">Registrar retirada</button>
          <button type="button" class="eq-btn" id="btnSoCadastrar">Só cadastrar (fica no prédio)</button>
        </div>
      </form>`;

    const form = document.getElementById("eqFormVinc");
    const erro = document.getElementById("eqVincErro");

    async function enviar(destino) {
      const condominio_id = Number(document.getElementById("fCondo").value);
      if (!condominio_id) {
        erro.textContent = "Escolha o condomínio de onde a bomba veio.";
        erro.classList.add("is-erro");
        document.getElementById("fCondo").focus();
        return;
      }
      erro.textContent = "";
      erro.classList.remove("is-erro");
      const botoes = form.querySelectorAll("button");
      botoes.forEach(b => (b.disabled = true));

      try {
        await api(`/equipamentos/${eq.id}/vincular`, {
          method: "POST",
          body: JSON.stringify({
            condominio_id,
            destino,
            tipo:             document.getElementById("fTipo").value,
            apelido:          document.getElementById("fApelido").value.trim(),
            local_instalacao: document.getElementById("fLocal").value.trim(),
            defeito_relatado: document.getElementById("fDefeito").value.trim(),
            marca:            document.getElementById("fMarca").value.trim(),
            modelo:           document.getElementById("fModelo").value.trim(),
            numero_serie:     document.getElementById("fSerie").value.trim(),
          }),
        });
        carregar();
      } catch (e) {
        erro.textContent = e.message;
        erro.classList.add("is-erro");
        botoes.forEach(b => (b.disabled = false));
      }
    }

    form.addEventListener("submit", (ev) => { ev.preventDefault(); enviar("oficina"); });
    document.getElementById("btnSoCadastrar").addEventListener("click", () => enviar("instalado"));
  }

  /**
   * A ação que a tela oferece, escolhida pelo estado. Uma só — as outras ficam
   * recolhidas. Sem ação primária (baixada), a bomba saiu do ciclo.
   */
  function acaoPrimaria(status) {
    if (status === "instalado" || status === "devolvido") {
      return { tipo: "retirada", label: "Retirar para conserto" };
    }
    if (status === "pronto") return { tipo: "devolucao", label: "Devolver ao condomínio" };
    if (status === "baixado") return null;
    return { tipo: "pronto", label: "Marcar como pronta" }; // oficina e derivados
  }

  function acoesSecundarias(status) {
    const lista = [];
    if (status === "instalado" || status === "devolvido") {
      lista.push({ tipo: "entrada_oficina", label: "Chegou na oficina" });
    }
    if (status === "oficina" || status === "em_conserto") {
      lista.push({ tipo: "aguardando_peca", label: "Aguardando peça" });
    }
    if (status === "aguardando_peca") lista.push({ tipo: "em_conserto", label: "Voltou pra bancada" });
    if (status !== "baixado") lista.push({ tipo: "anotacao", label: "Anotação" });
    return lista;
  }

  /** Ficha de equipamento já vinculado. */
  function telaFicha(ficha) {
    const eq = ficha.equipamento;

    // Há quanto tempo NESTE estado: a movimentação mais recente que colocou o
    // equipamento no status atual — não a última que mexeu em status qualquer,
    // que responderia "desde a última mudança" e mente quando o estado foi
    // ajustado por outro caminho.
    const ultimaDeEstado = ficha.movimentacoes.find(m => m.status_novo === eq.status)
      || ficha.movimentacoes.find(m => m.status_novo);
    const dias = diasDesde(ultimaDeEstado ? ultimaDeEstado.criado_em : eq.vinculado_em);

    // Quem relatou o defeito e quando — o relato sem procedência vira boato.
    const relatoMov = [...ficha.movimentacoes].reverse().find(m => m.tipo === "retirada");

    // Parada demais é informação operacional, não enfeite: 7 dias acende
    // âmbar, 15 acende vermelho. Só vale enquanto ela está na oficina.
    const naOficina = ["oficina", "em_conserto", "aguardando_peca", "aguardando_orcamento"].includes(eq.status);
    const classeTempo = naOficina && dias >= 15 ? "is-longa" : naOficina && dias >= 7 ? "is-parada" : "";

    const paradaAtual = eq.status === "instalado" && relatoDevolvida(ficha)
      ? 3
      : (PARADA_POR_STATUS[eq.status] ?? -1);

    const primaria = acaoPrimaria(eq.status);
    const secundarias = acoesSecundarias(eq.status);

    const dados = [
      ["Tipo", eq.tipo, false], ["Marca", eq.marca, false], ["Modelo", eq.modelo, false],
      ["Nº de série", eq.numero_serie, true],
      ["Potência", eq.potencia_cv ? `${eq.potencia_cv} cv` : null, true],
      ["Tensão", eq.tensao, true], ["Onde fica", eq.local_instalacao, false],
      ["Garantia até", eq.garantia_ate ? new Date(eq.garantia_ate).toLocaleDateString("pt-BR") : null, true],
    ].filter(([, v]) => v);

    $root.innerHTML = `
      <section class="eq-decisao">
        <h1 class="eq-condominio">${esc(eq.condominio_nome || "Sem condomínio vinculado")}</h1>
        <p class="eq-equip"><b>${esc(nomeEquipamento(eq))}</b>${
          eq.local_instalacao ? ` · ${esc(eq.local_instalacao)}` : ""}</p>
        ${enderecoDe(eq) ? `<p class="eq-endereco">${esc(enderecoDe(eq))}</p>` : ""}

        <div class="eq-trilho" id="eqTrilho" role="img"
             aria-label="Ciclo: ${esc(PARADAS[paradaAtual] || "fora do ciclo")}">
          ${PARADAS.map((p, i) => `
            <div class="eq-parada ${i < paradaAtual ? "is-feita" : i === paradaAtual ? "is-aqui" : ""}">${p}</div>
          `).join("")}
        </div>

        <p class="eq-estado ${classeTempo}">
          <span>${esc(ESTADO_FRASE[eq.status] || eq.status)}</span>
          ${dias != null ? `<span class="eq-dias">${esc(faz(dias))}</span>` : ""}
        </p>

        ${eq.defeito_relatado ? `
          <blockquote class="eq-relato">${esc(eq.defeito_relatado)}
            ${relatoMov ? `<cite class="eq-relato-fonte">relatado por ${esc(relatoMov.autor || "—")} ao retirar</cite>` : ""}
          </blockquote>` : ""}

        ${ficha.idas_oficina >= 2 ? `
          <p class="eq-reincidencia">${ICONE_ALERTA}
            <span>Já foi retirada <b>${ficha.idas_oficina} vezes</b> para conserto.</span></p>` : ""}

        ${primaria
          ? `<button class="eq-acao-principal" data-mov="${primaria.tipo}">${primaria.label}</button>`
          : `<p class="eq-aviso" style="margin-top:16px">Equipamento baixado — fora de operação.</p>`}

        <p class="eq-aviso eq-acao-erro" id="eqAcaoErro"></p>

        ${secundarias.length ? `
          <details class="eq-mais">
            <summary>Outras ações ${ICONE_CHEVRON}</summary>
            <div class="eq-mais-lista">
              ${secundarias.map(a => `<button class="eq-btn" data-mov="${a.tipo}">${a.label}</button>`).join("")}
            </div>
          </details>` : ""}
      </section>

      <section class="eq-secao">
        <div class="eq-secao-cab">
          <h2 class="eq-secao-titulo">Fotos</h2>
          <button class="eq-secao-acao" id="btnFoto">Adicionar</button>
        </div>
        <div class="eq-fotos" id="eqFotos">
          ${ficha.fotos.length
            // src transparente de 1x1 como estado inicial: a imagem real chega
            // por blob (rota autenticada), e um <img> sem src pisca o ícone de
            // imagem quebrada até lá.
            ? ficha.fotos.map(f => `<img src="${PIXEL_VAZIO}"
                alt="${esc(f.legenda || "Foto do equipamento")}" data-foto="${f.id}">`).join("")
            : `<p class="eq-vazio">Nenhuma foto ainda. Vale a placa de identificação e o ponto do defeito.</p>`}
        </div>
        <input type="file" accept="image/*" capture="environment" id="inputFoto" hidden>
      </section>

      ${dados.length ? `
        <section class="eq-secao">
          <div class="eq-secao-cab"><h2 class="eq-secao-titulo">Equipamento</h2></div>
          <div class="eq-dados">
            ${dados.map(([r, v, num]) => `
              <div>
                <div class="eq-dado-rot">${esc(r)}</div>
                <div class="eq-dado-val ${num ? "is-num" : ""}">${esc(v)}</div>
              </div>`).join("")}
          </div>
        </section>` : ""}

      <section class="eq-secao">
        <div class="eq-secao-cab"><h2 class="eq-secao-titulo">Histórico</h2></div>
        ${ficha.movimentacoes.length ? `
          <ul class="eq-linha">
            ${ficha.movimentacoes.map(m => `
              <li class="${MARCOS.has(m.tipo) ? "is-marco" : ""}">
                <div class="eq-mov-tipo">${esc(MOV_LABEL[m.tipo] || m.tipo)}</div>
                <div class="eq-mov-meta">
                  ${dataHora(m.criado_em)}${m.autor ? ` · ${esc(m.autor)}` : ""}
                  ${m.chamado_titulo ? ` · chamado #${m.chamado_id}` : ""}
                  ${m.os_numero ? ` · O.S. ${esc(m.os_numero)}` : ""}
                </div>
                ${m.observacao ? `<div class="eq-mov-obs">${esc(m.observacao)}</div>` : ""}
              </li>`).join("")}
          </ul>`
          : `<p class="eq-vazio">Sem movimentações registradas.</p>`}
      </section>

      <p class="eq-rodape">
        Etiqueta ${formatarCodigo(eq.codigo)}${eq.lote ? ` · lote ${esc(eq.lote)}` : ""}
      </p>`;

    ligarAcoes(ficha);
    carregarFotos(eq.id);

    // O único momento de movimento da página: o trilho acende até onde a bomba
    // está. Roda uma vez, depois da pintura.
    const trilho = document.getElementById("eqTrilho");
    if (trilho && paradaAtual >= 0) requestAnimationFrame(() => trilho.classList.add("is-animando"));
  }

  /** A bomba já completou um ciclo (voltou ao prédio depois de um conserto)? */
  function relatoDevolvida(ficha) {
    return ficha.movimentacoes.some(m => m.tipo === "devolucao");
  }

  // A imagem vem por rota autenticada, e `<img src>` não manda o header
  // Authorization — apontar o src direto daria 401 e miniatura quebrada.
  //
  // A saída fácil seria abrir a rota da imagem (é o que
  // `/ordens-servico/:id/fotos/:id/imagem` faz). Aqui não: o id da foto é
  // sequencial e adivinhável, e a foto é do interior da casa de máquinas de um
  // cliente. Busca com header e mostra o blob.
  let _blobUrls = [];
  function limparBlobs() {
    _blobUrls.forEach(u => URL.revokeObjectURL(u));
    _blobUrls = [];
  }

  async function carregarFotos(equipamentoId) {
    for (const img of document.querySelectorAll("#eqFotos img[data-foto]")) {
      try {
        const r = await fetch(`/equipamentos/${equipamentoId}/fotos/${img.dataset.foto}/imagem`, {
          headers: { Authorization: "Bearer " + token() },
        });
        if (!r.ok) continue;
        const url = URL.createObjectURL(await r.blob());
        _blobUrls.push(url);
        img.src = url;
      } catch (_) { /* miniatura sem imagem é melhor que a ficha inteira falhar */ }
    }
  }

  function falhar(msg) {
    const erro = document.getElementById("eqAcaoErro");
    if (!erro) return;
    erro.textContent = msg;
    erro.classList.add("is-erro");
  }

  function travar(v) {
    $root.querySelectorAll("[data-mov], #btnFoto").forEach(b => (b.disabled = v));
  }

  // Delegado instalado UMA vez: `$root` sobrevive a cada re-render, então
  // ligá-lo dentro de ligarAcoes() empilharia um handler por recarga — e a
  // terceira movimentação dispararia três requisições.
  let _equipamentoId = null;
  let _delegadoLigado = false;

  function ligarDelegado() {
    if (_delegadoLigado) return;
    _delegadoLigado = true;

    $root.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-mov]");
      if (!btn || !_equipamentoId) return;
      const tipo = btn.dataset.mov;

      // Anotação exige texto; nas demais a observação é opcional — cancelar o
      // prompt registra sem observação, que é o caso comum (só marcar que chegou).
      const texto = prompt(
        tipo === "anotacao"
          ? "O que você quer registrar nesta bomba?"
          : `Alguma observação sobre "${MOV_LABEL[tipo] || tipo}"? (opcional)`
      );
      if (tipo === "anotacao" && !String(texto || "").trim()) return;

      const erro = document.getElementById("eqAcaoErro");
      if (erro) { erro.textContent = ""; erro.classList.remove("is-erro"); }
      const rotulo = btn.textContent;
      btn.textContent = "Registrando…";
      travar(true);
      try {
        await api(`/equipamentos/${_equipamentoId}/movimentacoes`, {
          method: "POST",
          body: JSON.stringify({ tipo, observacao: texto || null }),
        });
        carregar();
      } catch (e) {
        falhar(e.message);
        btn.textContent = rotulo;
        travar(false);
      }
    });
  }

  /** Liga o que é recriado a cada render (os elementos são novos, não acumulam). */
  function ligarAcoes(ficha) {
    const eq = ficha.equipamento;
    _equipamentoId = eq.id;
    ligarDelegado();

    const input = document.getElementById("inputFoto");
    const btnFoto = document.getElementById("btnFoto");
    btnFoto.addEventListener("click", () => input.click());
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      btnFoto.disabled = true;
      btnFoto.textContent = "Enviando…";
      try {
        const dados_base64 = await comprimirImagem(file);
        await api(`/equipamentos/${eq.id}/fotos`, {
          method: "POST",
          body: JSON.stringify({ dados_base64 }),
        });
        carregar();
      } catch (e) {
        falhar(e.message);
        btnFoto.disabled = false;
        btnFoto.textContent = "Adicionar";
      } finally {
        input.value = "";
      }
    });

    // Visor em tela cheia — resolve "não dá pra ler o número de série na miniatura".
    document.getElementById("eqFotos").addEventListener("click", (ev) => {
      const img = ev.target.closest("img[data-foto]");
      if (!img || !img.src) return;
      const visor = document.createElement("div");
      visor.className = "eq-visor";
      visor.innerHTML = `<img src="${img.src}" alt="">`;
      const fechar = () => { visor.remove(); document.removeEventListener("keydown", onEsc); };
      const onEsc = (e) => { if (e.key === "Escape") fechar(); };
      visor.addEventListener("click", fechar);
      document.addEventListener("keydown", onEsc);
      document.body.appendChild(visor);
    });
  }

  // ---------------------------------------------------------------------
  // Carga
  // ---------------------------------------------------------------------

  async function carregar() {
    limparBlobs(); // cada recarga refaz as miniaturas; sem isso elas acumulam
    try {
      const ficha = await api(`/equipamentos/codigo/${CODIGO}`);
      if (ficha.equipamento.status === "etiqueta_livre") await telaVincular(ficha.equipamento);
      else telaFicha(ficha);
    } catch (e) {
      if (e.status === 403) {
        telaErro("Esta ficha é da equipe",
          "Seu usuário não tem acesso à ficha de equipamentos. Fale com o administrador.");
      } else if (e.status === 404) {
        telaErro("Etiqueta não encontrada",
          `Nenhum equipamento com o código <b>${formatarCodigo(CODIGO)}</b>. ` +
          `Confira se bate com o que está impresso na etiqueta.`);
      } else {
        telaErro("Não consegui abrir a ficha", esc(e.message));
      }
    }
  }

  // Início
  $topoCod.textContent = formatarCodigo(CODIGO);
  if (!CODIGO) {
    telaErro("Etiqueta sem código", "O endereço aberto não tem um código de equipamento.");
  } else if (!token()) {
    irParaLogin();
  } else {
    carregar();
  }
})();
