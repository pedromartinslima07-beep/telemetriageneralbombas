// Ficha do equipamento — o que a etiqueta QR abre (/e/:codigo).
//
// Quem está nesta tela tem a bomba na frente e uma pergunta só: de quem é isso
// e o que ela tem. Por isso a resposta ocupa o topo e tudo mais desce.
//
// A tela tem dois modos, decididos pelo backend:
//   • etiqueta livre  → formulário curto de vínculo (o técnico acabou de colar)
//   • já vinculada    → ficha + linha do tempo + ações
//
// Não usa nenhum token nem função de admin.js — é página autônoma que apenas
// carrega admin.css pelos tokens visuais.

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

  // `next` devolve o técnico pra ESTA bomba depois do login. Sem isso ele
  // escaneia, loga e cai no painel — e escaneia de novo.
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
    catch (_) {
      throw new Error(`Resposta inesperada do servidor (HTTP ${resp.status}).`);
    }
    if (!resp.ok) { const e = new Error(dados.error || `Erro ${resp.status}`); e.status = resp.status; throw e; }
    return dados;
  }

  // ---------------------------------------------------------------------
  // Utilitários de exibição
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
      + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  const STATUS_LABEL = {
    etiqueta_livre:       ["Etiqueta em branco", "is-livre"],
    instalado:            ["No condomínio", "is-ok"],
    oficina:              ["Na oficina", "is-oficina"],
    aguardando_orcamento: ["Aguardando orçamento", "is-espera"],
    aguardando_peca:      ["Aguardando peça", "is-espera"],
    em_conserto:          ["Em conserto", "is-oficina"],
    pronto:               ["Pronta para devolver", "is-ok"],
    devolvido:            ["Devolvida", "is-ok"],
    baixado:              ["Baixada", "is-baixado"],
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

  // Movimentações que marcam virada de ciclo ganham ponto aceso na linha.
  const MARCOS = new Set(["retirada", "devolucao", "baixa", "cadastro"]);

  const TIPOS = ["bomba", "motor", "painel", "quadro", "boia", "outro"];

  function selo(status) {
    const [label, cls] = STATUS_LABEL[status] || [status || "—", ""];
    return `<span class="eq-selo ${cls}">${esc(label)}</span>`;
  }

  function enderecoDe(eq) {
    const partes = [eq.condominio_endereco, eq.condominio_bairro,
                    [eq.condominio_cidade, eq.condominio_uf].filter(Boolean).join("/")];
    return partes.filter(Boolean).join(" · ");
  }

  // ---------------------------------------------------------------------
  // Foto: comprime ANTES de subir
  // ---------------------------------------------------------------------

  // Foto de celular moderno tem 4-8 MB; em base64 infla ~33% e estoura o
  // limite de 8mb do express.json — o mesmo erro que já mordeu na assinatura
  // do e-mail e nas fotos da O.S. Redimensiona pra no máx. 1280px e requantiza.
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
    $root.innerHTML = `
      <div class="eq-erro">
        <h2>${esc(titulo)}</h2>
        <p>${texto}</p>
      </div>`;
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
      <div class="eq-resposta">
        <div class="eq-resposta-rotulo">Etiqueta em branco</div>
        <div class="eq-condominio">${formatarCodigo(eq.codigo)}</div>
        <p class="eq-aviso" style="margin-top:8px">
          Esta etiqueta ainda não tem equipamento. Preencha o mínimo agora, com a
          bomba na mão — o resto dá para completar depois.
        </p>
      </div>

      <form class="eq-bloco" id="eqFormVinc">
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

        <p class="eq-aviso" id="eqVincErro"></p>

        <div class="eq-acoes">
          <button type="submit" class="eq-btn is-primario" data-destino="oficina">
            Registrar retirada
          </button>
          <button type="button" class="eq-btn" id="btnSoCadastrar" data-destino="instalado">
            Só cadastrar (fica no prédio)
          </button>
        </div>
      </form>`;

    const form = document.getElementById("eqFormVinc");
    const erro = document.getElementById("eqVincErro");

    async function enviar(destino) {
      const condominio_id = Number(document.getElementById("fCondo").value);
      if (!condominio_id) {
        erro.textContent = "Escolha o condomínio de onde a bomba veio.";
        erro.classList.add("is-erro");
        return;
      }
      erro.textContent = "";
      erro.classList.remove("is-erro");
      form.querySelectorAll("button").forEach(b => (b.disabled = true));

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
        form.querySelectorAll("button").forEach(b => (b.disabled = false));
      }
    }

    form.addEventListener("submit", (ev) => { ev.preventDefault(); enviar("oficina"); });
    document.getElementById("btnSoCadastrar").addEventListener("click", () => enviar("instalado"));
  }

  /** Ficha de equipamento já vinculado. */
  function telaFicha(ficha) {
    const eq = ficha.equipamento;
    const dados = [
      ["Tipo", eq.tipo], ["Marca", eq.marca], ["Modelo", eq.modelo],
      ["Nº de série", eq.numero_serie],
      ["Potência", eq.potencia_cv ? `${eq.potencia_cv} cv` : null],
      ["Tensão", eq.tensao], ["Onde fica", eq.local_instalacao],
      ["Garantia até", eq.garantia_ate ? new Date(eq.garantia_ate).toLocaleDateString("pt-BR") : null],
    ].filter(([, v]) => v);

    const reincidente = ficha.idas_oficina >= 2;

    $root.innerHTML = `
      <div class="eq-resposta">
        <div class="eq-resposta-rotulo">De onde é</div>
        <div class="eq-condominio">${esc(eq.condominio_nome || "Sem condomínio vinculado")}</div>
        ${enderecoDe(eq) ? `<div class="eq-endereco">${esc(enderecoDe(eq))}</div>` : ""}
        <div class="eq-equip-nome">
          ${esc(eq.apelido || (eq.tipo ? eq.tipo[0].toUpperCase() + eq.tipo.slice(1) : "Equipamento"))}
          ${eq.local_instalacao ? ` — ${esc(eq.local_instalacao)}` : ""}
        </div>
        <div style="margin-top:12px">${selo(eq.status)}</div>
        ${eq.defeito_relatado ? `
          <div class="eq-defeito">
            <div class="eq-resposta-rotulo">Problema relatado</div>
            ${esc(eq.defeito_relatado)}
          </div>` : ""}
      </div>

      ${reincidente ? `
        <div class="eq-reincidencia">
          <span>⚠</span>
          <div>Já foi retirada <b>${ficha.idas_oficina} vezes</b> para conserto.</div>
        </div>` : ""}

      <div class="eq-bloco">
        <div class="eq-bloco-titulo">Registrar</div>
        <div class="eq-acoes" id="eqAcoes">
          ${botoesDeAcao(eq.status)}
        </div>
        <p class="eq-aviso" id="eqAcaoErro" style="margin-top:10px"></p>
      </div>

      <div class="eq-bloco">
        <div class="eq-bloco-titulo">Fotos</div>
        <div class="eq-fotos" id="eqFotos">
          ${ficha.fotos.length
            ? ficha.fotos.map(f => `
                <img alt="${esc(f.legenda || "Foto do equipamento")}"
                     data-foto="${f.id}">`).join("")
            : `<p class="eq-vazio">Nenhuma foto ainda.</p>`}
        </div>
        <div class="eq-acoes" style="margin-top:12px">
          <button class="eq-btn" id="btnFoto">Adicionar foto</button>
        </div>
        <input type="file" accept="image/*" capture="environment" id="inputFoto" hidden>
      </div>

      ${dados.length ? `
        <div class="eq-bloco">
          <div class="eq-bloco-titulo">Dados do equipamento</div>
          <div class="eq-dados">
            ${dados.map(([r, v]) => `
              <div>
                <div class="eq-dado-rot">${esc(r)}</div>
                <div class="eq-dado-val">${esc(v)}</div>
              </div>`).join("")}
          </div>
        </div>` : ""}

      <div class="eq-bloco">
        <div class="eq-bloco-titulo">Histórico</div>
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
      </div>

      <p class="eq-aviso" style="text-align:center">
        Etiqueta ${formatarCodigo(eq.codigo)}${eq.lote ? ` · lote ${esc(eq.lote)}` : ""}
      </p>`;

    ligarAcoes(ficha);
    carregarFotos(eq.id);
  }

  // A imagem vem por rota autenticada, e `<img src>` não manda o header
  // Authorization — apontar o src direto daria 401 e miniatura quebrada.
  //
  // A saída fácil seria abrir a rota da imagem (é o que
  // `/ordens-servico/:id/fotos/:id/imagem` faz, com um comentário assumindo a
  // escolha). Aqui não: o id da foto é sequencial e adivinhável, e a foto é do
  // interior da casa de máquinas de um cliente. Busca com header e mostra o
  // blob — o custo é este punhado de linhas.
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

  /** Só as transições que fazem sentido a partir do estado atual. */
  function botoesDeAcao(status) {
    const b = (tipo, label, primario) =>
      `<button class="eq-btn ${primario ? "is-primario" : ""}" data-mov="${tipo}">${label}</button>`;

    const lista = [];
    if (status === "instalado" || status === "devolvido") {
      lista.push(b("retirada", "Retirar para conserto", true));
    }
    if (status === "oficina") {
      lista.push(b("pronto", "Marcar como pronta", true));
    }
    if (status === "pronto") {
      lista.push(b("devolucao", "Devolver ao condomínio", true));
    }
    if (status !== "instalado" && status !== "baixado" && status !== "oficina") {
      lista.push(b("entrada_oficina", "Está na oficina"));
    }
    if (status === "instalado") lista.push(b("entrada_oficina", "Chegou na oficina"));
    lista.push(b("anotacao", "Anotação"));
    return lista.join("");
  }

  function ligarAcoes(ficha) {
    const eq = ficha.equipamento;
    const erro = document.getElementById("eqAcaoErro");

    function falhar(msg) {
      erro.textContent = msg;
      erro.classList.add("is-erro");
    }

    document.getElementById("eqAcoes").addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-mov]");
      if (!btn) return;
      const tipo = btn.dataset.mov;

      // Anotação exige texto; nas demais a observação é opcional — cancelar o
      // prompt registra a movimentação sem observação, que é o caso comum
      // (o técnico só quer marcar que chegou).
      const texto = prompt(
        tipo === "anotacao"
          ? "O que você quer registrar nesta bomba?"
          : `Alguma observação sobre "${MOV_LABEL[tipo] || tipo}"? (opcional)`
      );
      if (tipo === "anotacao" && !String(texto || "").trim()) return;

      erro.textContent = "";
      erro.classList.remove("is-erro");
      document.querySelectorAll("#eqAcoes button").forEach(x => (x.disabled = true));
      try {
        await api(`/equipamentos/${eq.id}/movimentacoes`, {
          method: "POST",
          body: JSON.stringify({ tipo, observacao: texto || null }),
        });
        carregar();
      } catch (e) {
        falhar(e.message);
        document.querySelectorAll("#eqAcoes button").forEach(x => (x.disabled = false));
      }
    });

    const input = document.getElementById("inputFoto");
    document.getElementById("btnFoto").addEventListener("click", () => input.click());
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const btn = document.getElementById("btnFoto");
      btn.disabled = true;
      btn.textContent = "Enviando…";
      try {
        const dados_base64 = await comprimirImagem(file);
        await api(`/equipamentos/${eq.id}/fotos`, {
          method: "POST",
          body: JSON.stringify({ dados_base64 }),
        });
        carregar();
      } catch (e) {
        falhar(e.message);
        btn.disabled = false;
        btn.textContent = "Adicionar foto";
      } finally {
        input.value = "";
      }
    });

    // Visor de foto — abrir a imagem em tela cheia é o que resolve "não dá pra
    // ver o número de série nessa miniatura".
    document.getElementById("eqFotos").addEventListener("click", (ev) => {
      const img = ev.target.closest("img[data-foto]");
      if (!img) return;
      const visor = document.createElement("div");
      visor.className = "eq-visor";
      visor.innerHTML = `<img src="${img.src}" alt="">`;
      visor.addEventListener("click", () => visor.remove());
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
        telaErro(
          "Esta ficha é da equipe",
          "Seu usuário não tem acesso à ficha de equipamentos. Fale com o administrador."
        );
      } else if (e.status === 404) {
        telaErro(
          "Etiqueta não encontrada",
          `Nenhum equipamento com o código <b>${formatarCodigo(CODIGO)}</b>. ` +
          `Confira se o código bate com o impresso na etiqueta.`
        );
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
