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
// Folha própria (equipamento.css), no padrão do cartão da tela de assinatura de
// contrato. Não carrega admin.css nem usa nada de admin.js.

(function () {
  "use strict";

  const $root = document.getElementById("eqRoot");
  const $rodape = document.getElementById("eqRodape");

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

  const CLASSE_BADGE = {
    instalado: "predio", devolvido: "predio",
    oficina: "oficina", em_conserto: "oficina",
    aguardando_orcamento: "oficina", aguardando_peca: "oficina",
    pronto: "pronta", baixado: "baixada", etiqueta_livre: "livre",
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
    $root.innerHTML = `<div class="erro"><h1>${esc(titulo)}</h1><p>${texto}</p></div>`;
  }

  /** O rodapé fora do cartão carrega a identidade da etiqueta. */
  function rodape(eq) {
    if (!$rodape) return;
    $rodape.textContent = eq
      ? `Etiqueta ${formatarCodigo(eq.codigo)}${eq.lote ? ` · lote ${eq.lote}` : ""}`
      : `Etiqueta ${formatarCodigo(CODIGO)}`;
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

    rodape(eq);
    $root.innerHTML = `
      <h1>Etiqueta em branco</h1>
      <div class="sub">Preencha o mínimo agora, com a bomba na mão — o resto dá para completar depois.</div>
      <span class="badge livre">${formatarCodigo(eq.codigo)}</span>

      <form id="eqFormVinc">
        <div class="campo">
          <label for="fCondo">Condomínio <span class="obrigatorio">*</span></label>
          <select id="fCondo" required>
            <option value="">Selecione…</option>
            ${lista.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join("")}
          </select>
        </div>

        <div class="campo-duplo">
          <div class="campo">
            <label for="fTipo">Tipo</label>
            <select id="fTipo">
              ${TIPOS.map(t => `<option value="${t}">${t[0].toUpperCase() + t.slice(1)}</option>`).join("")}
            </select>
          </div>
          <div class="campo">
            <label for="fApelido">Identificação</label>
            <input id="fApelido" placeholder="Bomba 2 — recalque" maxlength="120">
          </div>
        </div>

        <div class="campo">
          <label for="fLocal">Onde fica no prédio</label>
          <input id="fLocal" placeholder="Casa de máquinas, ao lado do quadro" maxlength="200">
        </div>

        <div class="campo">
          <label for="fDefeito">Qual é o problema</label>
          <textarea id="fDefeito" placeholder="Não liga. Zelador diz que parou depois da chuva de sábado."></textarea>
        </div>

        <div class="campo-duplo">
          <div class="campo">
            <label for="fMarca">Marca</label>
            <input id="fMarca" maxlength="120">
          </div>
          <div class="campo">
            <label for="fModelo">Modelo</label>
            <input id="fModelo" maxlength="120">
          </div>
        </div>

        <div class="campo">
          <label for="fSerie">Número de série</label>
          <input id="fSerie" maxlength="120">
        </div>

        <div class="erro-msg" id="eqVincErro"></div>

        <button type="submit" class="submit-btn">Registrar retirada</button>
        <div style="margin-top:8px">
          <button type="button" class="btn-linha" id="btnSoCadastrar">Só cadastrar (fica no prédio)</button>
        </div>
      </form>`;

    const form = document.getElementById("eqFormVinc");
    const erro = document.getElementById("eqVincErro");

    async function enviar(destino) {
      const condominio_id = Number(document.getElementById("fCondo").value);
      if (!condominio_id) {
        erro.textContent = "Escolha o condomínio de onde a bomba veio.";
        document.getElementById("fCondo").focus();
        return;
      }
      erro.textContent = "";
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
    // Pedir orçamento é ação da bancada: só faz sentido com a bomba aqui e
    // ainda sem resposta do cliente.
    if (["oficina", "em_conserto", "aguardando_peca"].includes(status)) {
      lista.push({ acao: "orcamento", label: "Solicitar orçamento" });
    }
    if (status === "oficina" || status === "em_conserto") {
      lista.push({ tipo: "aguardando_peca", label: "Aguardando peça" });
    }
    if (status === "aguardando_peca") lista.push({ tipo: "em_conserto", label: "Voltou pra bancada" });
    if (status !== "baixado") lista.push({ tipo: "anotacao", label: "Anotação" });
    return lista;
  }

  const ORC_STATUS = {
    rascunho:  ["Rascunho", "livre"],
    enviado:   ["Enviado ao cliente", "pronta"],
    aprovado:  ["Aprovado", "predio"],
    rejeitado: ["Recusado", "baixada"],
  };

  function moeda(v) {
    const n = Number(v);
    if (!n) return null;
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
    const classeTempo = naOficina && dias >= 15 ? "tarde" : naOficina && dias >= 7 ? "atencao" : "";

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

    rodape(eq);
    $root.innerHTML = `
      <h1>${esc(eq.condominio_nome || "Sem condomínio vinculado")}</h1>
      <div class="sub">
        <b>${esc(nomeEquipamento(eq))}</b>${eq.local_instalacao ? ` · ${esc(eq.local_instalacao)}` : ""}
        ${enderecoDe(eq) ? `<br>${esc(enderecoDe(eq))}` : ""}
      </div>
      <span class="badge ${CLASSE_BADGE[eq.status] || "livre"}">${esc(ESTADO_FRASE[eq.status] || eq.status)}</span>

      <div class="trilho" id="eqTrilho" role="img"
           aria-label="Ciclo: ${esc(PARADAS[paradaAtual] || "fora do ciclo")}">
        ${PARADAS.map((p, i) => `
          <div class="parada ${i < paradaAtual ? "feita" : i === paradaAtual ? "aqui" : ""}">${p}</div>
        `).join("")}
      </div>

      ${dias != null ? `
        <p class="estado ${classeTempo}">
          ${esc(ESTADO_FRASE[eq.status] || eq.status)} <span class="dias">${esc(faz(dias))}</span>
        </p>` : ""}

      ${eq.defeito_relatado ? `
        <blockquote class="relato">${esc(eq.defeito_relatado)}
          ${relatoMov ? `<cite>relatado por ${esc(relatoMov.autor || "—")} ao retirar</cite>` : ""}
        </blockquote>` : ""}

      ${ficha.idas_oficina >= 2 ? `
        <p class="alerta">${ICONE_ALERTA}
          <span>Já foi retirada <b>${ficha.idas_oficina} vezes</b> para conserto.</span></p>` : ""}

      <div class="erro-msg" id="eqAcaoErro"></div>

      ${primaria
        ? `<button class="submit-btn" data-mov="${primaria.tipo}">${primaria.label}</button>`
        : `<p class="vazio">Equipamento baixado — fora de operação.</p>`}

      ${secundarias.length ? `
        <details class="mais">
          <summary>Outras ações ${ICONE_CHEVRON}</summary>
          <div class="mais-lista">
            ${secundarias.map(a => a.acao
              ? `<button class="btn-linha" data-acao="${a.acao}">${a.label}</button>`
              : `<button class="btn-linha" data-mov="${a.tipo}">${a.label}</button>`).join("")}
          </div>
        </details>` : ""}

      ${dados.length ? `
        <hr class="divider">
        <div class="secao-titulo">Equipamento</div>
        <table class="info">
          ${dados.map(([r, v, num]) => `
            <tr><td>${esc(r)}</td><td class="${num ? "num" : ""}">${esc(v)}</td></tr>`).join("")}
        </table>` : ""}

      <hr class="divider">
      <div class="secao-cab">
        <div class="secao-titulo">Fotos</div>
        <button class="sign-clear" id="btnFoto"
          style="font-size:12px;color:#7ba4f7;background:none;border:none;cursor:pointer;font-family:inherit;padding:0">Adicionar</button>
      </div>
      <div class="fotos" id="eqFotos">
        ${ficha.fotos.length
          // src transparente de 1x1 como estado inicial: a imagem real chega
          // por blob (rota autenticada), e um <img> sem src pisca o ícone de
          // imagem quebrada até lá.
          ? ficha.fotos.map(f => `<img src="${PIXEL_VAZIO}"
              alt="${esc(f.legenda || "Foto do equipamento")}" data-foto="${f.id}">`).join("")
          : `<p class="vazio">Nenhuma foto ainda. Vale a placa de identificação e o ponto do defeito.</p>`}
      </div>
      <input type="file" accept="image/*" capture="environment" id="inputFoto" hidden>

      ${(ficha.orcamentos || []).length ? `
        <hr class="divider">
        <div class="secao-titulo">Orçamentos</div>
        <table class="info">
          ${ficha.orcamentos.map(o => {
            const [rot, cls] = ORC_STATUS[o.status] || [o.status, "livre"];
            const val = moeda(o.valor_total);
            return `<tr>
              <td class="num">${esc(o.numero)}</td>
              <td>
                <span class="badge ${cls}" style="margin:0 0 3px">${esc(rot)}</span><br>
                <span style="font-weight:400;color:#9094ae;font-size:12px">
                  ${o.itens} ${Number(o.itens) === 1 ? "item" : "itens"}${val ? ` · ${esc(val)}` : " · sem valor lançado"}
                </span>
              </td></tr>`;
          }).join("")}
        </table>` : ""}

      <hr class="divider">
      <div class="secao-titulo">Histórico</div>
      ${ficha.movimentacoes.length ? `
        <ul class="linha">
          ${ficha.movimentacoes.map(m => `
            <li class="${MARCOS.has(m.tipo) ? "marco" : ""}">
              <div class="mov-tipo">${esc(MOV_LABEL[m.tipo] || m.tipo)}</div>
              <div class="mov-meta">
                ${dataHora(m.criado_em)}${m.autor ? ` · ${esc(m.autor)}` : ""}
                ${m.chamado_titulo ? ` · chamado #${m.chamado_id}` : ""}
                ${m.os_numero ? ` · O.S. ${esc(m.os_numero)}` : ""}
              </div>
              ${m.observacao ? `<div class="mov-obs">${esc(m.observacao)}</div>` : ""}
            </li>`).join("")}
        </ul>`
        : `<p class="vazio">Sem movimentações registradas.</p>`}`;

    ligarAcoes(ficha);
    carregarFotos(eq.id);

    // O único momento de movimento da página: o trilho acende até onde a bomba
    // está. Roda uma vez, depois da pintura.
    const trilho = document.getElementById("eqTrilho");
    if (trilho && paradaAtual >= 0) requestAnimationFrame(() => trilho.classList.add("animando"));
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
      const acao = ev.target.closest("[data-acao]");
      if (acao && _equipamentoId) {
        if (acao.dataset.acao === "orcamento") abrirOrcamento();
        return;
      }

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
      if (erro) erro.textContent = "";
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

  // ---------------------------------------------------------------------
  // Solicitar orçamento (Fase 12B)
  // ---------------------------------------------------------------------

  // Quem está na bancada sabe QUAL peça falta, não quanto ela custa — quem
  // precifica é o comercial. Por isso o formulário pede descrição e quantidade,
  // e o valor fica em branco: `orcamento_linhas.valor_unitario` é nullable
  // desde a migration 062, e o PDF omite a coluna de valor do item sem preço.
  function abrirOrcamento() {
    const painel = document.createElement("div");
    painel.className = "visor";
    painel.style.cursor = "default";
    painel.innerHTML = `
      <div class="card" style="max-width:460px;padding:28px 26px 24px;max-height:88vh;overflow:auto">
        <h1>Solicitar orçamento</h1>
        <div class="sub">Liste o que a bomba precisa. O comercial põe os preços.</div>
        <div id="orcItens"></div>
        <button type="button" class="btn-linha" id="orcAddItem" style="margin-top:4px">+ Outra peça</button>
        <div class="campo" style="margin-top:16px">
          <label for="orcObs">Constatação (opcional)</label>
          <textarea id="orcObs" placeholder="Rotor gasto e selo mecânico vazando."></textarea>
        </div>
        <div class="erro-msg" id="orcErro"></div>
        <button type="button" class="submit-btn" id="orcEnviar">Solicitar orçamento</button>
        <button type="button" class="btn-linha" id="orcCancelar" style="margin-top:8px">Cancelar</button>
      </div>`;
    document.body.appendChild(painel);

    const lista = painel.querySelector("#orcItens");
    function addItem() {
      const linha = document.createElement("div");
      linha.className = "campo-duplo";
      linha.style.gridTemplateColumns = "1fr 64px";
      linha.innerHTML = `
        <div class="campo" style="margin-bottom:8px">
          <input class="orc-desc" placeholder="Selo mecânico 1.1/4" maxlength="255">
        </div>
        <div class="campo" style="margin-bottom:8px">
          <input class="orc-qtd" type="number" min="1" value="1" inputmode="numeric">
        </div>`;
      lista.appendChild(linha);
      linha.querySelector(".orc-desc").focus();
    }
    addItem();

    painel.querySelector("#orcAddItem").addEventListener("click", addItem);
    painel.querySelector("#orcCancelar").addEventListener("click", () => painel.remove());

    painel.querySelector("#orcEnviar").addEventListener("click", async () => {
      const itens = [...lista.querySelectorAll(".campo-duplo")].map(l => ({
        descricao: l.querySelector(".orc-desc").value.trim(),
        quantidade: Number(l.querySelector(".orc-qtd").value) || 1,
      })).filter(i => i.descricao);

      const erro = painel.querySelector("#orcErro");
      if (!itens.length) {
        erro.textContent = "Descreva ao menos uma peça.";
        return;
      }
      erro.textContent = "";
      const botoes = painel.querySelectorAll("button");
      botoes.forEach(b => (b.disabled = true));
      try {
        const r = await api(`/equipamentos/${_equipamentoId}/orcamento`, {
          method: "POST",
          body: JSON.stringify({ itens, constatacao: painel.querySelector("#orcObs").value.trim() }),
        });
        painel.remove();
        carregar();
        alert(`Orçamento ${r.numero} criado como rascunho.\n\nO comercial lança os preços e envia ao cliente pelo painel, em Orçamentos.`);
      } catch (e) {
        erro.textContent = e.message;
        botoes.forEach(b => (b.disabled = false));
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
      visor.className = "visor";
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
  rodape(null);
  if (!CODIGO) {
    telaErro("Etiqueta sem código", "O endereço aberto não tem um código de equipamento.");
  } else if (!token()) {
    irParaLogin();
  } else {
    carregar();
  }
})();
