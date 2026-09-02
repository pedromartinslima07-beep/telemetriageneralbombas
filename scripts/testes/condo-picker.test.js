// Teste do condo-picker.js sem navegador: um DOM mínimo, só o que o
// componente toca. Roda com `node scripts/testes/condo-picker.test.js`.
//
// ⚠️ O QUE ELE PROVA É A BUSCA, que é a razão de o componente existir — em
// especial que procurar pela RAZÃO SOCIAL acha o prédio cujo nome de tela é o
// fantasia. Em produção 71 dos 86 cadastros têm os dois nomes diferentes, e um
// `<select>` só mostra um deles.
//
// ⚠️ ELE NÃO PROVA O DESENHO nem o teclado — para isso é preciso navegador.
const fs = require("fs");
const vm = require("vm");

function criarEl(tag) {
  const el = {
    tagName: String(tag).toUpperCase(),
    children: [], filhos: [], _html: "", value: "", type: "", id: "",
    className: "", dataset: {}, style: {}, hidden: false, attrs: {},
    _ouvintes: {},
    parentNode: null,
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k] ?? null; },
    removeAttribute(k) { if (k === "id") this.id = ""; delete this.attrs[k]; },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    insertBefore(c) { c.parentNode = this; this.children.push(c); return c; },
    addEventListener(ev, fn) { (this._ouvintes[ev] = this._ouvintes[ev] || []).push(fn); },
    dispatchEvent() { return true; },
    focus() {},
    disparar(ev, e) { (this._ouvintes[ev] || []).forEach((f) => f(e || {})); },
    querySelector(sel) { return this._porClasse(sel.replace(".", "")); },
    querySelectorAll(sel) { return this._todosPorClasse(sel.replace(".", "")); },
    _porClasse(c) {
      for (const f of this.children) {
        if ((f.className || "").split(/\s+/).includes(c)) return f;
        const d = f._porClasse ? f._porClasse(c) : null;
        if (d) return d;
      }
      return null;
    },
    _todosPorClasse() { return []; },
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c, v) { v ? this._s.add(c) : this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
  };
  return el;
}

// A caixa que o componente cria por innerHTML: o harness devolve os três
// filhos que ele procura depois (campo, botão limpar, lista).
function prepararCaixa(caixa) {
  const campo  = criarEl("input");  campo.className  = "input cbx-campo";
  const limpar = criarEl("button"); limpar.className = "cbx-limpar"; limpar.hidden = true;
  const lista  = criarEl("ul");     lista.className  = "cbx-lista";  lista.hidden = true;
  lista._todosPorClasse = () => [];
  caixa.children.push(campo, limpar, lista);
  return { campo, limpar, lista };
}

const pai = criarEl("div");
const original = criarEl("select");
original.id = "ncCondo";
original.parentNode = pai;

let caixaCriada = null;
const document_ = {
  getElementById(id) { return id === "ncCondo" ? original : null; },
  createElement(tag) {
    const el = criarEl(tag);
    if (tag === "div") { caixaCriada = el; prepararCaixa(el); }
    return el;
  },
  addEventListener() {},
};

const ctx = {
  document: document_, window: {}, console,
  Event: function () {}, setTimeout,
  String, Number, Array, Object, JSON, Math, RegExp,
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("public/condo-picker.js", "utf8"), ctx, { filename: "condo-picker.js" });

const CP = ctx.window.CondoPicker;
if (!CP) throw new Error("CondoPicker não exportado");

const ITENS = [
  { id: 1, nome: "ELVIRA FERRAZ EMPREENDIMENTOS IMOBILIARIOS LTDA", nome_fantasia: "Auri Faria Lima", bairro: "Itaim Bibi", cidade: "São Paulo" },
  { id: 2, nome: "CONDOMINIO EDIFICIO VILA MARIANA", nome_fantasia: "Residencial Vila Mariana", bairro: "Vila Mariana", cidade: "São Paulo" },
  { id: 3, nome: "Edifício Mont Blanc", nome_fantasia: "", bairro: "Moema", cidade: "São Paulo" },
  { id: 4, nome: "SAO CAETANO PRIME LTDA", nome_fantasia: "São Caetano Prime", bairro: "Centro", cidade: "São Caetano do Sul" },
  { id: 5, nome: "EDIS CENTER COMERCIAL LTDA", nome_fantasia: "Édis Center", bairro: "República", cidade: "São Paulo" },
];

CP.montar({ campo: "ncCondo", itens: ITENS, permiteVazio: true });
const { campo, limpar, lista } = { campo: caixaCriada._porClasse("cbx-campo"),
                                   limpar: caixaCriada._porClasse("cbx-limpar"),
                                   lista: caixaCriada._porClasse("cbx-lista") };
const hidden = caixaCriada.children.find((c) => c.type === "hidden");

// Digitar e ler quais prédios sobraram no HTML da lista.
function buscar(texto) {
  campo.value = texto;
  campo.disparar("input");
  const html = lista.innerHTML;
  return ITENS.filter((c) => {
    const nome = (c.nome_fantasia || "").trim() || c.nome;
    return html.includes(">" + nome.replace(/&/g, "&amp;") + "<");
  }).map((c) => c.id);
}

const casos = [
  ["nome de exibição (fantasia)",        "auri",            [1]],
  ["RAZÃO SOCIAL — o nome do CNPJ",      "elvira",          [1]],
  ["sem acento acha com acento",         "sao caetano",     [4]],
  ["acento no meio da palavra",          "edis",            [5]],
  ["bairro",                             "moema",           [3]],
  ["cidade",                             "sao caetano do sul", [4]],
  ["dois termos FORA DE ORDEM",          "mariana vila",    [2]],
  ["termo que não existe",               "zzzz",            []],
  ["vazio devolve tudo",                 "",                [1, 2, 3, 4, 5]],
  ["caixa alta não importa",             "AURI",            [1]],
  ["parcial no meio da palavra",         "ferraz",          [1]],
];

let falhas = 0;
for (const [nome, termo, esperado] of casos) {
  const got = buscar(termo);
  const ok = JSON.stringify(got) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log((ok ? "PASS " : "FAIL ") + nome + "  \"" + termo + "\" → [" + got + "]" +
              (ok ? "" : "  esperado [" + esperado + "]"));
}

// O contrato do campo: o valor gravado é o id, e o texto visível é o nome.
const p = ctx.document.getElementById("ncCondo")._picker;
p.definir(1);
const c1 = hidden.value === "1";
const c2 = campo.value === "Auri Faria Lima";
p.limpar();
const c3 = hidden.value === "" && campo.value === "";
[["campo hidden guarda o id", c1], ["campo visível mostra o fantasia", c2], ["limpar zera os dois", c3]]
  .forEach(([n, ok]) => { if (!ok) falhas++; console.log((ok ? "PASS " : "FAIL ") + n); });

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OK (" + (casos.length + 3) + " checagens)");
process.exit(falhas ? 1 : 0);
