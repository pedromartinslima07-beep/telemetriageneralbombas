// O trilho do modal de orçamento: vínculo NÃO é pedido do técnico.
// Roda com `node scripts/testes/trilho-os-vinculada.test.js`. Sem banco.
//
// ⚠️ O QUE ELE PROVA é o segundo relato do Pedro (03/09/2026): depois de
// vincular um orçamento a uma O.S. à mão, o trilho dizia "O que o técnico
// pediu / Marcou que precisa de orçamento e não escreveu o quê. Vale ligar
// para José Glebson." — e aquela O.S. não estava na aba "Solicitados pelos
// técnicos". Não estava porque lá o critério é `orcamento_necessario`; o
// trilho olhava só `os_id` e daí AFIRMAVA o pedido.
//
// A premissa "tem os_id, logo o técnico pediu" valia enquanto a única forma de
// existir `os_id` era o backend criar o orçamento a partir de um pedido. O
// vínculo manual pelo `<select>` quebrou isso.
//
// ⚠️ ELE NÃO PROVA O DESENHO — para isso é a prévia `/dev/_orcamentos-preview.html`,
// que ganhou o orçamento 605 justamente neste estado.
const fs = require("fs");
const vm = require("vm");

const src = fs.readFileSync("public/admin.js", "utf8");
const ABRE = "        ${o.os_id ? `";
const FECHA = '<div class="av-rail-hr"></div>` : ""}';
const ini = src.indexOf(ABRE);
if (ini < 0) throw new Error("bloco do trilho não encontrado em admin.js");
const fim = src.indexOf(FECHA, ini);
if (fim < 0) throw new Error("fim do bloco do trilho não encontrado");
const trecho = src.slice(ini, fim + FECHA.length);

const ctx = { _waEscaparHtml: (s) => String(s), out: null, o: null };
vm.createContext(ctx);
const render = (o) => { ctx.o = o; vm.runInContext("out = `" + trecho + "`;", ctx); return ctx.out; };

const r = [];
const ok = (nome, cond) => r.push([nome, cond]);

const base = {
  os_id: 109, os_numero: "OS-2026-0055",
  os_tecnico_nome: "José Glebson", os_chamado_id: 4821,
};

// ── 1. COM pedido do técnico ────────────────────────────────────────────
const comObs = render({ ...base, os_orcamento_necessario: true, orcamento_observacoes: "Trocar o selo da bomba 2." });
ok("com pedido: título é 'O que o técnico pediu'", comObs.includes("O que o técnico pediu"));
ok("com pedido: mostra o que ele escreveu", comObs.includes("Trocar o selo da bomba 2."));

const semObs = render({ ...base, os_orcamento_necessario: true, orcamento_observacoes: null });
ok("com pedido e sem texto: mantém o 'vale ligar'", semObs.includes("Vale ligar para José Glebson"));

// ── 2. SEM pedido — o relato ────────────────────────────────────────────
const manual = render({ ...base, os_orcamento_necessario: false, orcamento_observacoes: null });
ok("sem pedido: título vira 'O.S. vinculada'", manual.includes("O.S. vinculada"));
ok("O RELATO: não diz mais 'O que o técnico pediu'", !manual.includes("O que o técnico pediu"));
ok("O RELATO: não afirma que ele marcou precisar de orçamento", !manual.includes("Marcou que precisa"));
ok("O RELATO: não manda ligar para quem não pediu nada", !manual.includes("Vale ligar"));
ok("sem pedido: diz de onde veio o vínculo", manual.includes("Vinculada aqui pelo escritório"));

// ⚠️ O bloco NÃO some: a O.S. vinculada é informação útil. Ele só para de
// alegar que alguém pediu.
ok("sem pedido: o técnico continua visível (é dado da O.S.)", manual.includes("José Glebson"));
ok("sem pedido: o número da O.S. continua visível", manual.includes("OS-2026-0055"));
ok("sem pedido: o chamado continua visível", manual.includes("#4821"));

// ── 3. Sem O.S. nenhuma ─────────────────────────────────────────────────
ok("sem os_id: o bloco não aparece", render({ os_id: null }).trim() === "");

// ── 4. Undefined não vira pedido ────────────────────────────────────────
// Um registro antigo em cache, ou uma rota que ainda não devolva a flag, cai
// aqui: o certo é NÃO alegar pedido — a alegação é que precisa de prova.
const semFlag = render({ ...base, orcamento_observacoes: null });
ok("flag ausente não é tratada como pedido", !semFlag.includes("Marcou que precisa"));

for (const [n, c] of r) console.log(`${c ? "✓" : "✗"} ${n}`);
const falhas = r.filter(([, c]) => !c);
console.log(`\n${r.length - falhas.length}/${r.length} passaram`);
if (falhas.length) process.exitCode = 1;
