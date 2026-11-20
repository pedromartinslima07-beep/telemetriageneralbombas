// Teste do "excluir pedido" da lista de orçamentos. Roda com
// `node scripts/testes/orc-linha-excluir.test.js` — sem navegador e sem banco.
//
// ⚠️ O QUE ELE PROVA: que o "Excluir pedido" só existe para o PEDIDO de O.S.
// sem documento (o da oficina sempre tem documento por trás, e a exclusão dele
// é a do próprio orçamento, na página), e que o clique nele não cai no handler
// que seleciona/abre a linha.
//
// ⚠️ A LISTA MUDOU DE LUGAR (20/11/2026). Era a lixeira na linha da tabela
// antiga de Solicitados, desenhada por _orcRenderTudo; a tabela saiu do HTML e
// a lista é o molde (admin-orc-lista.js + admin-lista.js). O botão mora no
// painel do pedido. As garantias são as mesmas.
//
// ⚠️ ELE NÃO PROVA O CSS nem o confirm — para isso é preciso navegador.
const fs = require("fs");

const orc = fs.readFileSync("public/admin-orc-lista.js", "utf8");
const molde = fs.readFileSync("public/admin-lista.js", "utf8");

const r = [];
const ok = (n, c) => r.push([n, c]);

// ── Onde o botão aparece ────────────────────────────────────────────────────
const det = orc.slice(orc.indexOf("function detalhe(x)"));
const ramoPedido = det.slice(det.indexOf("const acoes = x.pedido"), det.indexOf("      : [", det.indexOf("const acoes = x.pedido")));
ok("o painel tem o ramo do pedido", ramoPedido.length > 0);
ok("o Excluir pedido mora só no ramo do pedido", ramoPedido.includes("data-orc-excluir") &&
   (det.match(/data-orc-excluir=/g) || []).length === 1);
ok("o Fazer orçamento também está nele", ramoPedido.includes("data-orc-fazer"));
ok("tem rótulo visível", ramoPedido.includes("Excluir pedido"));
// Pedido = linha de _orcData SEM documento. O da oficina sempre tem
// orcamento_id, então nunca vira "pedido" e nunca ganha o botão.
ok("pedido só nasce de _orcData sem orcamento_id", /pedidosOs\(\)[\s\S]{0,200}orcamento_id/.test(orc));

// ── O clique ────────────────────────────────────────────────────────────────
const aoClicar = orc.slice(orc.indexOf("aoClicar: e =>"));
const linhaExcluir = aoClicar.split("\n").find(l => l.includes("[data-orc-excluir]")) || "";
ok("o clique no Excluir chama _orcExcluirPedido e para ali",
   linhaExcluir.includes("_orcExcluirPedido(") && linhaExcluir.includes("return true"));

// No molde, aoClicar roda ANTES da seleção da linha, e a linha ignora clique
// em botão — é a mesma ordem dos dois `closest` que a tabela antiga tinha.
const deleg = molde.slice(molde.indexOf("if (cfg.aoClicar && cfg.aoClicar(e)) return;"));
ok("no molde, aoClicar vem antes da seleção da linha",
   deleg.length > 0 && deleg.indexOf("[data-ls-linha]") > 0);
ok("e a linha não abre por clique em botão",
   /closest\("\[data-ls-linha\]"\)\) && !e\.target\.closest\("a, button/.test(deleg));

const falhas = r.filter(([, c]) => !c);
for (const [n, c] of r) console.log(`${c ? "✓" : "✗"} ${n}`);
console.log(`\n${r.length - falhas.length}/${r.length} passaram`);
if (falhas.length) process.exitCode = 1;
