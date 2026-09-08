// Simulador do ciclo de vida de um equipamento — a ficha `/e/:codigo` do
// começo ao fim, sem banco e sem login.
//
//   node scripts/simular-equipamento.js      → http://localhost:4700
//
// Serve os arquivos REAIS de `public/` (equipamento.html/css/js) contra um
// backend de mentira que guarda tudo em memória. Ou seja: a tela é a de
// produção, byte por byte; o que é falso é só o banco. Fechou o processo,
// sumiu o estado — nada toca o Postgres, e por isso dá para clicar à vontade.
//
// Para que serve: percorrer o caminho inteiro da bomba (etiqueta em branco →
// retirada → oficina → orçamento → peça → conserto → pronta → devolvida) e ver
// a ficha mudar a cada passo. É o que nenhum screenshot mostra: como a tela se
// comporta quando o estado avança.
//
// ⚠️ NÃO é teste automatizado. As rotas aqui IMITAM `src/routes/equipamentos.
// routes.js` — o mapa `STATUS_POR_TIPO` abaixo é cópia do de lá —, mas não
// validam permissão, não checam transição inválida e não conhecem o schema.
// Mudou a rota de verdade? Este arquivo não acusa nada; ele só continua
// mentindo do jeito antigo.
//
// ⚠️ O botão de movimentação abre um `prompt()` do navegador pedindo a
// observação — é o comportamento real da tela. Responder ou cancelar dá no
// mesmo (a observação é opcional em tudo, menos em "Anotação").

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORTA = Number(process.env.PORTA || 4700);
const RAIZ = path.join(__dirname, "..");
// ⚠️ O CÓDIGO PRECISA SER CROCKFORD VÁLIDO — sem I, L, O nem U. O front
// normaliza o que vem da URL (I/L → 1, O → 0, U → V) justamente porque quem
// digita o código de uma etiqueta suja confunde essas letras; um código de
// simulação com I e O chega ao servidor transformado e cai em "Etiqueta não
// encontrada". Aconteceu com o `SIM1BOMB` desta linha, que virava `S1M1B0MB`.
const CODIGO = "S1MB0MBA";

// Cópia de `STATUS_POR_TIPO` em src/routes/equipamentos.routes.js. `null` = não
// mexe no status (anotação é nota livre). ⚠️ `devolucao` leva a `instalado`,
// não a `devolvido`: o estado verdadeiro depois da entrega é "está no prédio
// funcionando", e é esse que a bancada precisa ver.
const STATUS_POR_TIPO = {
  cadastro: "instalado",
  retirada: "oficina",
  entrada_oficina: "oficina",
  diagnostico: null,
  orcamento_solicitado: "aguardando_orcamento",
  orcamento_aprovado: "em_conserto",
  em_conserto: "em_conserto",
  aguardando_peca: "aguardando_peca",
  pronto: "pronto",
  devolucao: "instalado",
  anotacao: null,
  baixa: "baixado",
};

const CONDOMINIOS = [
  { id: 1, nome: "Residencial Alto da Lapa" },
  { id: 2, nome: "Edifício Serra Azul" },
  { id: 3, nome: "Condomínio Vila Olímpia 21" },
];

const AUTOR = "Pedro (simulação)";

let estado;
function reiniciar() {
  estado = {
    equipamento: {
      id: 1,
      codigo: CODIGO,
      lote: "LSIM",
      status: "etiqueta_livre",
      condominio_id: null,
    },
    movimentacoes: [],
    fotos: [],
    orcamentos: [],
    ordens_servico: [],
    proximaFoto: 1,
    proximoOrc: 1,
  };
}
reiniciar();

/** Registra a movimentação e move o status, como faz a rota de verdade. */
function mover(tipo, observacao, extra = {}) {
  const novo = STATUS_POR_TIPO[tipo];
  if (novo) estado.equipamento.status = novo;
  estado.movimentacoes.unshift({
    tipo,
    status_novo: novo || null,
    observacao: observacao || null,
    criado_em: new Date().toISOString(),
    autor: AUTOR,
    ...extra,
  });
}

/** Quantas vezes esta bomba já foi para a oficina — o alerta de reincidência. */
function idasOficina() {
  return estado.movimentacoes.filter((m) => m.tipo === "retirada").length;
}

function ficha() {
  const eq = estado.equipamento;
  const condo = CONDOMINIOS.find((c) => c.id === eq.condominio_id);
  return {
    equipamento: {
      ...eq,
      condominio_nome: condo ? condo.nome : null,
      condominio_endereco: condo ? "Rua Guaicurus, 1200" : null,
      condominio_bairro: condo ? "Lapa" : null,
      condominio_cidade: condo ? "São Paulo" : null,
      condominio_uf: condo ? "SP" : null,
    },
    movimentacoes: estado.movimentacoes,
    fotos: estado.fotos.map((f) => ({ id: f.id, legenda: f.legenda })),
    orcamentos: estado.orcamentos,
    ordens_servico: estado.ordens_servico,
    idas_oficina: idasOficina(),
  };
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
};

function json(res, codigo, corpo) {
  res.writeHead(codigo, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(corpo));
}

function lerCorpo(req) {
  return new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => {
      try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); }
    });
  });
}

// A ficha exige um token no localStorage e manda para /login quando não acha.
// Aqui o "login" é uma linha de JS: grava um token qualquer e devolve a pessoa
// para onde ela estava. A rota real fica em src/routes/auth.routes.js.
const HTML_LOGIN = `<!doctype html><meta charset=utf-8><title>Entrando…</title>
<body style="background:#030a26">
<script>
  localStorage.setItem("token", "simulacao");
  const p = new URLSearchParams(location.search).get("next") || "/e/${CODIGO}";
  location.replace(p);
</script>`;

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = decodeURIComponent(url.pathname);

  if (p === "/" ) { res.writeHead(302, { Location: `/e/${CODIGO}` }); return res.end(); }
  if (p === "/login") {
    res.writeHead(200, { "Content-Type": MIME[".html"] });
    return res.end(HTML_LOGIN);
  }
  if (p === "/reiniciar") {
    reiniciar();
    res.writeHead(302, { Location: `/e/${CODIGO}` });
    return res.end();
  }

  // ── API de mentira ────────────────────────────────────────────────────
  if (p === "/equipamentos/condominios") return json(res, 200, CONDOMINIOS);

  if (p.startsWith("/equipamentos/codigo/")) {
    const cod = p.split("/").pop().toUpperCase().replace(/-/g, "");
    if (cod !== CODIGO) return json(res, 404, { error: "Etiqueta não encontrada" });
    return json(res, 200, ficha());
  }

  if (req.method === "POST" && /^\/equipamentos\/\d+\/vincular$/.test(p)) {
    const b = await lerCorpo(req);
    if (!b.condominio_id) return json(res, 400, { error: "Escolha o condomínio." });
    Object.assign(estado.equipamento, {
      condominio_id: Number(b.condominio_id),
      tipo: b.tipo || "bomba",
      apelido: b.apelido || null,
      local_instalacao: b.local_instalacao || null,
      defeito_relatado: b.defeito_relatado || null,
      marca: b.marca || null,
      modelo: b.modelo || null,
      numero_serie: b.numero_serie || null,
      vinculado_em: new Date().toISOString(),
    });
    // O cadastro é sempre registrado; a retirada só quando o destino é a
    // oficina ("Registrar retirada"). "Só cadastrar" deixa a bomba no prédio.
    mover("cadastro", "Etiqueta vinculada com a bomba na mão.");
    if (b.destino === "oficina") mover("retirada", b.defeito_relatado || null);
    return json(res, 200, { ok: true });
  }

  if (req.method === "POST" && /^\/equipamentos\/\d+\/movimentacoes$/.test(p)) {
    const b = await lerCorpo(req);
    if (!STATUS_POR_TIPO.hasOwnProperty(b.tipo)) {
      return json(res, 400, { error: `Movimentação desconhecida: ${b.tipo}` });
    }
    mover(b.tipo, b.observacao);
    return json(res, 200, { ok: true });
  }

  if (req.method === "POST" && /^\/equipamentos\/\d+\/orcamento$/.test(p)) {
    const b = await lerCorpo(req);
    const itens = (b.itens || []).filter((i) => i.descricao);
    if (!itens.length) return json(res, 400, { error: "Descreva ao menos uma peça." });
    const numero = `ORC-SIM${String(estado.proximoOrc++).padStart(2, "0")}`;
    estado.orcamentos.unshift({
      numero,
      status: "rascunho",
      itens: itens.length,
      valor_total: null,   // quem precifica é o comercial, não a bancada
    });
    mover("orcamento_solicitado", b.constatacao || null, { orcamento_numero: numero });
    return json(res, 200, { numero });
  }

  if (req.method === "POST" && /^\/equipamentos\/\d+\/fotos$/.test(p)) {
    const b = await lerCorpo(req);
    if (!b.dados_base64) return json(res, 400, { error: "Foto vazia." });
    estado.fotos.push({ id: estado.proximaFoto++, legenda: null, dados: b.dados_base64 });
    return json(res, 200, { ok: true });
  }

  const mFoto = p.match(/^\/equipamentos\/\d+\/fotos\/(\d+)\/imagem$/);
  if (mFoto) {
    const f = estado.fotos.find((x) => x.id === Number(mFoto[1]));
    if (!f) { res.writeHead(404); return res.end(); }
    const [, tipo, b64] = f.dados.match(/^data:(.+?);base64,(.*)$/) || [];
    res.writeHead(200, { "Content-Type": tipo || "image/jpeg" });
    return res.end(Buffer.from(b64 || "", "base64"));
  }

  // ── arquivos reais de public/ ─────────────────────────────────────────
  const rel = p.startsWith("/static/") ? p.slice(8)
            : p.startsWith("/e/")      ? "equipamento.html"
            : p.slice(1);
  const arq = path.join(RAIZ, "public", rel);
  if (!arq.startsWith(path.join(RAIZ, "public")) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) {
    return json(res, 404, { error: "Não encontrado" });
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(arq)] || "application/octet-stream" });
  res.end(fs.readFileSync(arq));
});

servidor.listen(PORTA, () => {
  console.log(`
  Simulador da ficha do equipamento — nada aqui toca o banco.

    ficha       http://localhost:${PORTA}/e/${CODIGO}
    recomeçar   http://localhost:${PORTA}/reiniciar

  O caminho completo, clicando:

    1. Etiqueta em branco   escolha o condomínio e "Registrar retirada"
    2. Na oficina           "Outras ações" → Solicitar orçamento
    3. Aguardando orçamento "Outras ações" → Aguardando peça
    4. Aguardando peça      "Outras ações" → Voltou pra bancada
    5. Em conserto          "Marcar como pronta"
    6. Pronta               "Devolver ao condomínio"
    7. No condomínio        volta ao passo 1, e o trilho fecha o ciclo

  O botão de movimentação abre um prompt() pedindo a observação — é a tela
  real. Cancelar registra sem observação, que é o caso comum.
`);
});
