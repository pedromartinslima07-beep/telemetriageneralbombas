// Teste do desenho da linha da aba de orçamentos: a lixeira do "excluir
// pedido". Roda com `node scripts/testes/orc-linha-excluir.test.js` — sem
// navegador e sem banco.
//
// ⚠️ O QUE ELE PROVA: que a lixeira sai no HTML de um pedido de O.S., que ela
// NÃO sai no pedido da bancada (que não tem O.S. por trás, e cuja exclusão é a
// do próprio orçamento, no modal), e que o clique nela não cai no handler que
// abre/materializa o documento.
//
// ⚠️ ELE NÃO PROVA O CSS nem o confirm — para isso é preciso navegador.
const fs = require("fs");
const vm = require("vm");

const arquivo = fs.readFileSync("public/admin.js", "utf8");
const ini = arquivo.indexOf("function _orcRenderPainel(g) {");
if (ini < 0) throw new Error("_orcRenderPainel não encontrada");
const fim = arquivo.indexOf("\n}", arquivo.indexOf('<div class="av-orc-list">', ini)) + 2;
const trecho = arquivo.slice(ini, fim);

const wrap = { innerHTML: "" };
const ctx = {
  console, Number, String, Date, Math, JSON,
  document: { getElementById: (id) => (id === "orcPainel" ? wrap : null) },
  _waEscaparHtml: (s) => String(s ?? ""),
  _avLinhaRazao: () => "",
  _orcSolicitado: (o) => !o.orcamento_status,
  _orcFmtValor: (v) => (v == null ? "—" : "R$ " + v),
  _orcFmtData: () => "01/01/2026",
  _orcStatusCls: () => "orc-status-req",
  _orcStatusLabel: (s) => (s ? String(s).toUpperCase() : "SOLICITADO"),
  _orcSelecionado: null,
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(trecho, ctx, { filename: "_orcRenderPainel" });

const r = [];
const ok = (n, c) => r.push([n, c]);

ctx._orcRenderPainel({
  nome: "Ed. Teste", razao: null,
  itens: [
    { id: 7, numero: "OS-2026-1", fonte: "os", orcamento_status: null, orcamento_observacoes: "trocar selo" },
    { id: 8, numero: "OS-2026-2", fonte: "os", orcamento_status: "enviado", orcamento_valor: 500, orcamento_id: 3 },
    { id: null, numero: "ORC-9", fonte: "bancada", orcamento_status: "rascunho", orcamento_id: 9 },
  ],
});
const html = wrap.innerHTML;

ok("a lixeira aparece no pedido SOLICITADO", html.includes('data-orc-del="7"'));
ok("a lixeira aparece no pedido já orçado", html.includes('data-orc-del="8"'));
ok("a lixeira NÃO aparece no pedido da bancada", !html.includes('data-orc-del=""'));
ok("são exatamente duas lixeiras", (html.match(/data-orc-del=/g) || []).length === 2);
ok("tem rótulo para leitor de tela", html.includes('aria-label="Excluir este pedido de orçamento"'));

// ── O clique: a lixeira mora DENTRO da linha que abre o documento ──────────
// Réplica mínima do delegador de `#orcPainel` (o real depende de fetch e do
// modal inteiro). O que se prova aqui é a ORDEM dos dois `closest`.
{
  const chamadas = [];
  const alvo = {
    closest: (sel) => (sel === "[data-orc-del]"
      ? { dataset: { orcDel: "7" } }
      : { dataset: { orcId: "7", orcFonte: "os", orcOrcid: "" } }),
  };
  const handler = (e) => {
    const del = e.target.closest("[data-orc-del]");
    if (del) { chamadas.push(["excluir", Number(del.dataset.orcDel)]); return; }
    const item = e.target.closest(".av-orc-item[data-orc-fonte]");
    if (!item) return;
    chamadas.push(["abrir", Number(item.dataset.orcId)]);
  };
  handler({ target: alvo });
  ok("clicar na lixeira exclui e não abre o documento",
     chamadas.length === 1 && chamadas[0][0] === "excluir" && chamadas[0][1] === 7);
}

// A ordem real do arquivo tem de ser a mesma testada acima.
const bind = arquivo.slice(arquivo.indexOf('getElementById("orcPainel")?.addEventListener'));
ok("no arquivo, o closest da lixeira vem antes do da linha",
   bind.indexOf('[data-orc-del]') > -1 &&
   bind.indexOf('[data-orc-del]') < bind.indexOf('.av-orc-item[data-orc-fonte]'));

const falhas = r.filter(([, c]) => !c);
for (const [n, c] of r) console.log(`${c ? "✓" : "✗"} ${n}`);
console.log(`\n${r.length - falhas.length}/${r.length} passaram`);
if (falhas.length) process.exitCode = 1;
