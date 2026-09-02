// Teste do `salvarSenha()` do painel do operador, sem navegador. Roda com
// `node scripts/testes/senha-operador.test.js`.
//
// ⚠️ O QUE ELE PROVA são as quatro recusas de tela e o corpo que sai na rede —
// o que o operador digita errado é o caminho que se percorre todo dia, e é o
// único que não depende do servidor para responder.
//
// ⚠️ ELE NÃO PROVA O DESENHO do diálogo nem o foco — para isso é preciso
// navegador.
const fs = require("fs");
const vm = require("vm");

// Só o trecho que interessa: `salvarSenha` e o que ela chama. O arquivo
// inteiro pede Leaflet, `DADOS`, e a barra — nada disso é desta conta.
const arquivo = fs.readFileSync("public/operador.js", "utf8");
const ini = arquivo.indexOf("async function salvarSenha() {");
if (ini < 0) throw new Error("salvarSenha não encontrada");
const fim = arquivo.indexOf("\n}", arquivo.indexOf("finally {", ini)) + 2;
const trecho = arquivo.slice(ini, fim);

function montar(campos, resposta) {
  const els = {
    sfAtual: { value: campos.atual },
    sfNova:  { value: campos.nova },
    sfConf:  { value: campos.conf },
    sfMsg:   { textContent: "" },
  };
  const registro = { fechou: false, avisos: [], corpo: null, url: null };
  const btn = { disabled: false, textContent: "Trocar senha" };

  const ctx = {
    console, JSON, String, Number, Promise, setTimeout,
    document: {
      getElementById: (id) => els[id] || null,
      querySelector: () => btn,
    },
    authHeaders: () => ({ Authorization: "Bearer t" }),
    lerJson: async (r) => r.json(),
    fechar: () => { registro.fechou = true; },
    avisar: (t, ok) => { registro.avisos.push([t, !!ok]); },
    fetch: async (url, init) => {
      registro.url = url;
      registro.corpo = JSON.parse(init.body);
      return { ok: resposta.ok, status: resposta.status || 200, json: async () => resposta.corpo };
    },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(trecho, ctx, { filename: "salvarSenha" });
  return { rodar: ctx.salvarSenha, els, registro, btn };
}

const r = [];
const ok = (n, c) => r.push([n, c]);

(async () => {
  // ── As quatro recusas de tela: nenhuma chega à rede ───────────────────
  {
    const m = montar({ atual: "", nova: "abcdef", conf: "abcdef" }, { ok: true });
    await m.rodar();
    ok("campo em branco recusa sem chamar o servidor",
       m.els.sfMsg.textContent.includes("três campos") && m.registro.url === null);
  }
  {
    const m = montar({ atual: "certa", nova: "abcdef", conf: "abcdeX" }, { ok: true });
    await m.rodar();
    ok("repetição diferente recusa",
       m.els.sfMsg.textContent.includes("não conferem") && m.registro.url === null);
  }
  {
    const m = montar({ atual: "certa", nova: "abc", conf: "abc" }, { ok: true });
    await m.rodar();
    ok("menos de 6 caracteres recusa",
       m.els.sfMsg.textContent.includes("6 caracteres") && m.registro.url === null);
  }
  {
    const m = montar({ atual: "abcdef", nova: "abcdef", conf: "abcdef" }, { ok: true });
    await m.rodar();
    ok("senha nova igual à atual recusa",
       m.els.sfMsg.textContent.includes("diferente da atual") && m.registro.url === null);
  }

  // ── O caminho feliz ───────────────────────────────────────────────────
  {
    const m = montar({ atual: "certa", nova: "novasenha", conf: "novasenha" },
                     { ok: true, corpo: { ok: true } });
    await m.rodar();
    ok("manda para /auth/trocar-senha", m.registro.url === "/auth/trocar-senha");
    ok("o corpo usa os nomes que o backend espera",
       JSON.stringify(m.registro.corpo) ===
       JSON.stringify({ senha_atual: "certa", senha_nova: "novasenha" }));
    ok("fecha o diálogo ao dar certo", m.registro.fechou);
    ok("confirma na faixa, em verde",
       m.registro.avisos.length === 1 && m.registro.avisos[0][1] === true);
  }

  // ── O erro que só o servidor sabe ─────────────────────────────────────
  {
    const m = montar({ atual: "errada", nova: "novasenha", conf: "novasenha" },
                     { ok: false, status: 401, corpo: { error: "Senha atual incorreta" } });
    await m.rodar();
    ok("senha atual errada: mostra o erro DO SERVIDOR",
       m.els.sfMsg.textContent === "Senha atual incorreta");
    ok("senha atual errada: NÃO fecha o diálogo", !m.registro.fechou);
    ok("senha atual errada: não finge sucesso na faixa", m.registro.avisos.length === 0);
    ok("o botão volta a funcionar depois do erro",
       m.btn.disabled === false && m.btn.textContent === "Trocar senha");
  }

  let falhas = 0;
  for (const [n, v] of r) { if (!v) falhas++; console.log((v ? "PASS " : "FAIL ") + n); }
  console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OK (" + r.length + " checagens)");
  process.exit(falhas ? 1 : 0);
})();
