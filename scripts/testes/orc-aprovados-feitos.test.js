// O que sai da lista de Aprovados e o que fica. Sem navegador e sem banco.
//
//   node scripts/testes/orc-aprovados-feitos.test.js
//
// ⚠️ O QUE ELE PROVA é a conta que estava errada: até 03/09/2026 `render()`
// separava por `executado_em` e mais nada, então um orçamento com O.S.
// finalizada e chamado fechado continuava na lista principal pedindo
// execução — o relato do Pedro. As três formas de estar feito (marcado à mão,
// O.S. finalizada, chamado fechado) e as duas de estar em aberto (nada, ou
// chamado andando) estão todas aqui.
//
// ⚠️ ELE NÃO PROVA O DESENHO da placa — para isso é preciso navegador.
const fs = require("fs");
const vm = require("vm");

const arquivo = fs.readFileSync("public/operador-orcamentos.js", "utf8");
const ini = arquivo.indexOf("function execucao(o) {");
if (ini < 0) throw new Error("execucao não encontrada");
const fim = arquivo.indexOf("function estaFeito(o)", ini);
if (fim < 0) throw new Error("estaFeito não encontrada");
const trecho = arquivo.slice(ini, arquivo.indexOf("\n", fim) + 1);

const ctx = {
  console, Set, Boolean,
  ABERTO: new Set(["aberto", "em_atendimento"]),
  dia: (iso) => String(iso).slice(0, 10),
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(trecho, ctx, { filename: "execucao" });

const r = [];
const ok = (n, c) => r.push([n, c]);

const base = {
  executado_em: null, executado_por_nome: null,
  chamado_id: null, chamado_status: null,
  exec_os_id: null, exec_os_numero: null, exec_os_finalizada_em: null,
};
const caso = (extra) => Object.assign({}, base, extra);

// ── Os cinco estados ────────────────────────────────────────────────────
const livre    = caso({});
const andando  = caso({ chamado_id: 7, chamado_status: "aberto" });
const atendendo= caso({ chamado_id: 8, chamado_status: "em_atendimento" });
const executado= caso({ chamado_id: 9, chamado_status: "fechado",
                        exec_os_id: 4, exec_os_numero: "OS-2026-0051",
                        exec_os_finalizada_em: "2026-09-02T15:00:00Z" });
const fechadoSemOs = caso({ chamado_id: 10, chamado_status: "fechado" });
const marcado  = caso({ executado_em: "2026-08-30T12:00:00Z", executado_por_nome: "Marcelo" });

ok("sem chamado → livre",                 ctx.execucao(livre).chave === "livre");
ok("chamado aberto → andando",            ctx.execucao(andando).chave === "andando");
ok("em atendimento → andando",            ctx.execucao(atendendo).chave === "andando");
ok("O.S. finalizada → executado",         ctx.execucao(executado).chave === "executado");
ok("chamado fechado sem O.S. → feito",    ctx.execucao(fechadoSemOs).chave === "feito");
ok("marcado à mão ganha de tudo",         ctx.execucao(caso({
     executado_em: "2026-08-30T12:00:00Z", chamado_id: 9, chamado_status: "aberto",
   })).chave === "marcado");

// ⚠️ A O.S. entra no selo, e é o que o operador cita ao telefone.
ok("o estado executado carrega o número da O.S.", ctx.execucao(executado).os === "OS-2026-0051");
ok("e a data em que ela foi finalizada",         ctx.execucao(executado).quando === "2026-09-02");

// ── A conta que estava errada ───────────────────────────────────────────
ok("livre continua na lista",              !ctx.estaFeito(livre));
ok("chamado andando continua na lista",    !ctx.estaFeito(andando));
ok("O.S. finalizada SAI da lista",          ctx.estaFeito(executado));
ok("chamado fechado SAI da lista",          ctx.estaFeito(fechadoSemOs));
ok("marcado à mão SAI da lista",            ctx.estaFeito(marcado));

// A regressão concreta: antes, isto ficava na lista principal.
const DADOS = [livre, andando, executado, fechadoSemOs, marcado];
const abertos = DADOS.filter((o) => !ctx.estaFeito(o));
const feitos  = DADOS.filter(ctx.estaFeito);
ok("dos cinco, dois esperam execução", abertos.length === 2);
ok("e três já foram feitos",           feitos.length === 3);
ok("a conta antiga daria 4 em aberto",
   DADOS.filter((o) => !o.executado_em).length === 4);

// ── O botão "Ver O.S." ──────────────────────────────────────────────────
// ⚠️ Ele só existe no estado `executado`, e o motivo é que só ali existe uma
// O.S. para abrir. No `feito` (chamado fechado sem O.S.) um botão de ver
// documento apontaria para nada.
{
  const fonte = fs.readFileSync("public/operador-orcamentos.js", "utf8");
  const acoes = fonte.slice(fonte.indexOf("  const acao ="), fonte.indexOf('<article class="orc"'));
  const noExecutado = acoes.slice(acoes.indexOf('ex.chave === "executado"'), acoes.indexOf('ex.chave === "feito"'));
  ok("o Ver O.S. mora no estado executado", noExecutado.includes('data-acao="ver-os"'));
  ok("e não no chamado fechado sem O.S.",
     acoes.slice(acoes.indexOf('ex.chave === "feito"')).indexOf('data-acao="ver-os"') === -1);
  ok("ele leva o id da O.S., não o do orçamento", noExecutado.includes('data-id="${ex.osId}"'));
  ok("o executado também mantém o Abrir de novo", noExecutado.includes('data-acao="chamado"'));

  // A ação está ligada no delegador, e passa o botão junto (ele se desabilita
  // enquanto o PDF é gerado sob demanda).
  ok("a ação ver-os está no delegador de cliques",
     /if \(a === "ver-os"\) return verOS\(Number\(b\.dataset\.id\), b\);/.test(fonte));
  // ⚠️ O PDF exige Bearer: link direto no href devolveria "Token ausente".
  ok("o PDF é buscado com fetch + authHeaders, não href",
     fonte.includes('fetch("/ordens-servico/" + osId + "/pdf", { headers: authHeaders() })'));
  ok("e o objectURL é revogado depois, não na hora",
     /setTimeout\(\(\) => URL\.revokeObjectURL\(url\), 60000\)/.test(fonte));
}

const falhas = r.filter(([, c]) => !c);
for (const [n, c] of r) console.log((c ? "✓" : "✗") + " " + n);
console.log("\n" + (r.length - falhas.length) + "/" + r.length + " passaram");
if (falhas.length) process.exitCode = 1;
