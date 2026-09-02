// Teste do inatividade.js sem navegador. Roda com
// `node scripts/testes/inatividade.test.js`.
//
// ⚠️ O QUE ELE EXISTE PARA PEGAR É O CASO DE DUAS ABAS. `localStorage` é do
// NAVEGADOR, não da aba: o timer de uma tela que corta apaga o token que a tela
// de plantão está usando. Foi assim que o painel do operador continuou
// desconectando depois do `data-corte="nunca"` — ele não cortava, morria no 401
// da chamada seguinte. Um teste de uma aba só passa verde com esse defeito de pé,
// que é exatamente o que aconteceu em 02/09/2026.
const fs = require("fs");
const vm = require("vm");

const codigo = fs.readFileSync("public/inatividade.js", "utf8");
const T30 = 30 * 60 * 1000;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64")
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// ── Um navegador: um localStorage, várias abas ──────────────────────────
function navegador(opcoes) {
  opcoes = opcoes || {};
  const store = {};
  const nascimento = opcoes.sessaoHa == null ? 2 * 3600e3 : opcoes.sessaoHa;
  if (opcoes.semSessao !== true) {
    store.token = "x." + b64({ iat: Math.floor((Date.now() - nascimento) / 1000) }) + ".y";
    store.user = "{}";
  }
  if (opcoes.carimbo != null) store.tg_ultima_atividade = String(opcoes.carimbo);

  const abas = [];

  function abrir(corte) {
    const timers = [], intervalos = [], nav = [], eventos = {};
    const body = { dataset: corte ? { corte } : {} };
    const ctx = {
      console, Date, Number, JSON, String, Math, Buffer,
      atob: (s) => Buffer.from(s, "base64").toString("binary"),
      localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
      },
      document: {
        body,
        addEventListener: (ev, fn) => { (eventos[ev] = eventos[ev] || []).push(fn); },
        get visibilityState() { return "visible"; },
      },
      setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
      setInterval: (fn, ms) => { intervalos.push({ fn, ms }); return intervalos.length; },
      clearTimeout: () => {},
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    Object.defineProperty(ctx, "location", {
      get: () => ctx._loc || (ctx._loc = { _h: "/", get href() { return this._h; },
        set href(v) { this._h = v; nav.push(v); } }),
    });
    vm.createContext(ctx);
    vm.runInContext(codigo, ctx, { filename: "inatividade.js" });

    const aba = {
      nav, eventos, ctx, store,
      // dispara o timer de corte, como se tivessem passado 30 min
      estourar() {
        const t = timers.find((x) => x.ms === T30);
        if (t) { t.fn(); return true; }
        return false;
      },
      armouTimer() { return timers.some((x) => x.ms === T30); },
      pulsa() { return intervalos.length > 0; },
      pulsar() { intervalos.forEach((i) => i.fn()); },
      voltarPraAba() { (eventos.visibilitychange || []).forEach((f) => f()); },
    };
    abas.push(aba);
    return aba;
  }

  return { store, abrir };
}

const r = [];
const ok = (n, c) => r.push([n, c]);

// ── 1) Uma aba só: o comportamento de sempre ────────────────────────────
{
  const b = navegador({ carimbo: Date.now() - 5 * 60e3 });
  const admin = b.abrir(null);
  ok("normal: arma o timer de 30 min", admin.armouTimer());
  ok("normal: não pulsa", !admin.pulsa());
  ok("normal: 5 min não corta", !!b.store.token);
}
{
  const b = navegador({ carimbo: Date.now() - 45 * 60e3 });
  b.abrir(null);
  ok("normal: 45 min corta no carregamento", !b.store.token);
}
{
  const b = navegador({ carimbo: Date.now() - 5 * 60e3 });
  const plantao = b.abrir("nunca");
  ok("plantão: NÃO arma timer", !plantao.armouTimer());
  ok("plantão: PULSA sozinho", plantao.pulsa());
  ok("plantão: mantém a sessão", !!b.store.token);
}
{
  const b = navegador({ carimbo: Date.now() - 26 * 3600e3 });
  const p = b.abrir("nunca");
  ok("plantão: 26h paradas não cortam", !!b.store.token && p.nav.length === 0);
}

// ── 2) DUAS ABAS — o caso do relato ─────────────────────────────────────
{
  const b = navegador({ carimbo: Date.now() - 5 * 60e3 });
  const plantao = b.abrir("nunca");
  const admin   = b.abrir(null);

  // O plantão está aberto e pulsando; o admin fica 30 min ocioso e estoura.
  plantao.pulsar();
  admin.estourar();

  ok("DUAS ABAS: o timer do admin NÃO apaga o token do plantão", !!b.store.token);
  ok("DUAS ABAS: o admin também fica (o carimbo do plantão vale por ele)",
     admin.nav.length === 0);
}
{
  // E sem plantão aberto, o admin corta normalmente — o pulso não é um
  // desligar geral do recurso.
  //
  // ⚠️ O CARIMBO PRECISA SER VELHO AQUI. O timer só dispara 30 min DEPOIS da
  // última atividade, então nessa hora o carimbo tem 30 min. Armar com 5 min
  // e disparar o timer no instante seguinte é um cenário que não existe — e
  // era o teste, não o código, que estava errado: com a conferência do
  // carimbo no lugar, ele reprovou por descrever o mundo torto.
  const b = navegador({ carimbo: Date.now() - 31 * 60e3 });
  const admin = b.abrir(null);
  admin.estourar();
  ok("SEM plantão: o admin corta como sempre",
     !b.store.token && admin.nav[0] === "/login?motivo=inatividade");
}
{
  // ⚠️ E O CASO QUE O CONSERTO GANHOU DE BRINDE: trabalhar numa aba não pode
  // deixar a outra cortar a sessão. Antes de 02/09 o timer de cada aba corria
  // sozinho — quem passasse meia hora no admin de Chamados perdia a sessão
  // por causa da aba de Telemetria parada ao lado.
  //
  // ⚠️ As duas abrem com o carimbo NOVO — abrir com carimbo velho cortaria já
  // no carregamento, antes do que este caso quer observar.
  const b = navegador({ carimbo: Date.now() - 2 * 60e3 });
  const parada      = b.abrir(null);
  const trabalhando = b.abrir(null);
  // A pessoa passa a meia hora seguinte mexendo na segunda aba: o carimbo
  // compartilhado fica novo, e o timer da PRIMEIRA dispara mesmo assim.
  b.store.tg_ultima_atividade = String(Date.now());
  parada.estourar();
  ok("DUAS ABAS comuns: a parada não corta quem está trabalhando",
     !!b.store.token && parada.nav.length === 0);
}
{
  // Plantão FECHADO (pulso parou): o tempo volta a correr. Simula-se com o
  // carimbo velho — é exatamente o que sobra quando a aba morre.
  const b = navegador({ carimbo: Date.now() - 45 * 60e3 });
  const admin = b.abrir(null);
  ok("plantão fechado há 45 min: volta a cortar",
     !b.store.token && admin.nav[0] === "/login?motivo=inatividade");
}

// ── 3) O que não podia mudar ────────────────────────────────────────────
{
  const b = navegador({ carimbo: Date.now() - 45 * 60e3 });
  const cartao = b.abrir("cartao");
  ok("cartão de orçamentos: não vai para /login",
     cartao.nav.length === 0 && cartao.ctx._tgCorteAoCarregar === true);
}
{
  const b = navegador({ semSessao: true, carimbo: Date.now() });
  const a = b.abrir("nunca");
  ok("sem token: não faz nada", !a.armouTimer() && !a.pulsa() && a.nav.length === 0);
}
{
  // Carimbo anterior ao nascimento da sessão não vale (regra de 28/08).
  const b = navegador({ sessaoHa: 60e3, carimbo: Date.now() - 45 * 60e3 });
  const admin = b.abrir(null);
  ok("carimbo de sessão morta é ignorado", !!b.store.token && admin.nav.length === 0);
}
{
  const b = navegador({ carimbo: Date.now() - 3 * 3600e3 });
  const p = b.abrir("nunca");
  p.voltarPraAba();
  ok("plantão: voltar para a aba com 3h renova, não corta",
     !!b.store.token && p.nav.length === 0);
}

let falhas = 0;
for (const [n, v] of r) { if (!v) falhas++; console.log((v ? "PASS " : "FAIL ") + n); }
console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OK (" + r.length + " checagens)");
process.exit(falhas ? 1 : 0);
