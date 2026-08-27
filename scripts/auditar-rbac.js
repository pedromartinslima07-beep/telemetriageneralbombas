// Auditoria de RBAC: o que uma role alcança de verdade.
//
//   node scripts/auditar-rbac.js operador
//   node scripts/auditar-rbac.js gerente --tudo
//
// Existe porque **auditar por `grep adminOnly` mente**. Foi o que atrasou a
// restrição real do operador por três meses: `osDonoOuAdmin` e
// `GET /relatorio/pdf` checam a role *dentro do handler*, não num guard, e já
// barravam o operador — metade do trabalho estava pronta e invisível. Na mão
// oposta, `equipeInterna` deixava passar quem `adminOnly` também deixava, e
// isso não aparece em nenhuma leitura por prefixo.
//
// O que ele faz: percorre o `stack` real de cada router (a mesma estrutura que
// o Express consulta no request) e roda cada middleware de role com um `req`
// de mentira. Não abre conexão com o banco: guard que responde 403 nunca chega
// na query, e o que responde `next()` é interrompido antes do handler.
//
// ⚠️ Cobre **guards**. A coluna "sem guard de role" lista as rotas cuja
// checagem está no corpo do handler — essas continuam exigindo leitura humana
// (ou uma request de verdade). Elas são o motivo de este script imprimir a
// terceira lista em vez de dizer "tudo certo".

// O require dos routers puxa `src/config`, que aborta sem estas envs. Nenhum
// valor aqui é usado: nada nesta auditoria abre socket.
process.env.JWT_SECRET     = process.env.JWT_SECRET     || "auditoria".padEnd(32, "0");
process.env.CORS_ORIGINS   = process.env.CORS_ORIGINS   || "http://localhost";
process.env.DATABASE_URL   = process.env.DATABASE_URL   || "postgres://auditoria@127.0.0.1:1/none";

const path = require("path");

// Onde cada router é montado no `src/app.js`. Precisa acompanhar mudanças lá —
// é a única parte deste script que não se descobre sozinha.
const MOUNTS = {
  "admin.routes.js": "/admin",
  "alertas.routes.js": "",
  "chamados.routes.js": "/chamados",
  "cliente.routes.js": "/cliente",
  "condominios.routes.js": "/condominios",
  "contratos.routes.js": "/contratos",
  "equipamentos.routes.js": "/equipamentos",
  "jobs.routes.js": "/jobs",
  "leituras.routes.js": "",
  "operador.routes.js": "/operador",
  "ordens-servico.routes.js": "/ordens-servico",
  "planos-manutencao.routes.js": "/planos-manutencao",
  "relatorios.routes.js": "/relatorios",
  "reservatorios.routes.js": "/reservatorios",
  "status.routes.js": "/status",
  "tecnicos.routes.js": "/tecnicos",
  "tecnicos-localizacao.routes.js": "/tecnicos",
  "whatsapp.routes.js": "/whatsapp",
};

const E_GUARD = /Only$|equipeInterna|clienteOnly/;

/** Roda um guard com `role` e devolve true (passou), false (403) ou null. */
function passa(guard, role) {
  let liberou = false;
  let status = null;
  const req = { user: { role, id: 1 }, params: {}, query: {}, body: {} };
  const res = {
    status(c) { status = c; return this; },
    json() { return this; },
  };
  try {
    guard(req, res, () => { liberou = true; });
  } catch {
    return null; // guard async (clienteOnly) — não dá pra decidir sem banco
  }
  return liberou ? true : (status === 403 ? false : null);
}

function rotasDe(arquivo) {
  const mod = require(path.join(__dirname, "..", "src", "routes", arquivo));
  const router = (typeof mod === "function" && mod.stack)
    ? mod
    : Object.values(mod).find(v => typeof v === "function" && Array.isArray(v.stack));
  return (router && router.stack) || [];
}

function auditar(role) {
  const alcanca = [], bloqueada = [], semGuard = [];

  for (const [arquivo, base] of Object.entries(MOUNTS)) {
    let stack;
    try {
      stack = rotasDe(arquivo);
    } catch (err) {
      console.error(`  ⚠️  ${arquivo} não carregou: ${err.message}`);
      continue;
    }

    for (const layer of stack) {
      if (!layer.route) continue;
      const verbo = Object.keys(layer.route.methods).map(m => m.toUpperCase()).join("|");
      const rota = `${verbo} ${base}${layer.route.path}`.replace(/\/$/, "") || `${verbo} ${base}`;
      const guards = layer.route.stack.map(s => s.name).filter(n => E_GUARD.test(n));

      if (!guards.length) { semGuard.push({ rota }); continue; }

      // Um único 403 basta: o Express para na primeira recusa da cadeia.
      let veredito = true;
      for (const s of layer.route.stack) {
        if (!E_GUARD.test(s.name)) continue;
        if (passa(s.handle, role) === false) { veredito = false; break; }
      }
      (veredito ? alcanca : bloqueada).push({ rota, guards: guards.join(" + ") });
    }
  }

  const porRota = (a, b) => a.rota.localeCompare(b.rota);
  return {
    alcanca: alcanca.sort(porRota),
    bloqueada: bloqueada.sort(porRota),
    semGuard: semGuard.sort(porRota),
  };
}

const role = process.argv[2];
if (!role) {
  console.error("uso: node scripts/auditar-rbac.js <role> [--tudo]");
  console.error("roles: admin | gerente | operador | tecnico | cliente");
  process.exit(1);
}
const tudo = process.argv.includes("--tudo");

const { alcanca, bloqueada, semGuard } = auditar(role);

console.log(`\n=== ${role.toUpperCase()} ALCANÇA (${alcanca.length}) ===`);
for (const r of alcanca) console.log(`  ${r.rota.padEnd(48)} [${r.guards}]`);

console.log(`\n=== SEM GUARD DE ROLE (${semGuard.length}) — a checagem, se existe, está no handler ===`);
for (const r of semGuard) console.log(`  ${r.rota}`);

console.log(`\n=== BLOQUEADAS (${bloqueada.length}) ===`);
if (tudo) for (const r of bloqueada) console.log(`  ${r.rota.padEnd(48)} [${r.guards}]`);
else console.log("  (use --tudo para listar)");
console.log("");
