// A página de Alertas do admin só mostra o que é alerta de verdade.
//
//   node scripts/testes/alertas-so-o-que-e-alerta.test.js
//
// Sem banco e sem navegador: extrai as funções puras do `public/admin.js` e as
// roda contra fixtures.
//
// ⚠️ POR QUE ESTE TESTE EXISTE. Pedido do Pedro em 08/09/2026: *"qualquer tipo
// de chamado está gerando alerta e não está certo"*. Ele estava certo, e o
// defeito não era do backend — nada no servidor cria linha de `alertas` a
// partir de chamado (só `alertas.service.js`, da telemetria). Era a tela.
//
// ⚠️ E A REGRA JÁ EXISTIA. O badge do menu e o KPI do dashboard aplicavam
// "P1/P2, ou prazo estourado, ou absorveu telemetria" havia rodadas; a LISTA
// QUE A PÁGINA DESENHA era o único lugar que não aplicava. `renderAlertas()`
// passava o `_alUnificar()` cru — que empurra TODO chamado para dentro — e o
// `_alAplicarFiltros()` só filtra por aba, tipo, busca e data.
//
// ⚠️ O SINTOMA COMPOSTO, e é o que este teste protege: a tela mostrava MAIS
// itens do que o número que a anunciava. O próprio `admin.js` registra esse
// "8 aqui e 7 em Alertas" como bug conhecido, dado por resolvido quando só o
// KPI e o badge foram corrigidos. Por isso o teste não checa só o filtro: ele
// checa que **a lista desenhada e a lista contada são a mesma**.
const fs = require("fs");
const vm = require("vm");

const arquivo = fs.readFileSync("public/admin.js", "utf8");

function trecho(assinatura) {
  const ini = arquivo.indexOf(assinatura);
  if (ini < 0) throw new Error(assinatura + " não encontrada em public/admin.js");
  const fim = arquivo.indexOf("\n}", ini) + 2;
  return arquivo.slice(ini, fim);
}

const ctx = {
  console, Number, String, Date, Math, JSON, Map, Set, Array, Boolean, Object,
  _AL_TIPO_PARA_CATEGORIA: { nivel_baixo: "nivel_baixo", nivel_muito_baixo: "nivel_baixo",
                             dispositivo_offline: "bomba_falha" },
  _AL_SEV_PESO: { normal: 0, atencao: 1, critico: 2 },
  _mcDeviceCondoName: () => "Ed. Teste",
  _alSevLabel: (s) => s,
  _alertasAbertos: [],
  _chamadosData: [],
  _statusData: [],
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
for (const a of [
  "function _alCondoIdDoDevice(deviceId) {",
  "function _chamadoSlaEstourado(ch) {",
  "function _alChamadoDoAlerta(a) {",
  "function _alUnificar() {",
  "function _alContaComoAlerta(it) {",
  "function _alertasAtivosUnificados() {",
]) vm.runInContext(trecho(a), ctx, { filename: a });

const r = [];
const ok = (nome, cond, extra) => {
  r.push({ nome, cond: !!cond });
  console.log((cond ? "✓ " : "✗ ") + nome + (extra ? "  — " + extra : ""));
};

// ── A carteira de mentira ────────────────────────────────────────────────
// ⚠️ A forma importa: `_alCondoIdDoDevice` lê `g.condominio?.id`, não
// `g.condominio_id`. Fixture com a chave errada devolve `null`, o alerta não
// acha chamado nenhum e o teste "passa" medindo outra coisa.
ctx._statusData = [{ condominio: { id: 10 }, reservatorios: [{ device_id: "DEV-A" }] }];

const chamado = (id, prioridade, extra = {}) => ({
  id, prioridade, status: "aberto", condominio_id: 10,
  titulo: "Chamado #" + id, categoria: "outros", criado_em: "2026-09-08T10:00:00Z",
  ...extra,
});

ctx._chamadosData = [
  chamado(1, "p1"),                                        // alerta: prioridade
  chamado(2, "p2"),                                        // alerta: prioridade
  chamado(3, "p3"),                                        // NÃO é alerta
  chamado(4, "p4"),                                        // NÃO é alerta
  chamado(5, "p4", { sla_ttfr_estourado: true }),          // alerta: prazo estourado
  chamado(6, "p3", { categoria: "nivel_baixo" }),          // alerta: absorve telemetria
  chamado(7, "p1", { status: "fechado", fechado_em: "2026-09-08T12:00:00Z" }), // resolvido
  chamado(8, "p4", { status: "fechado", fechado_em: "2026-09-08T12:00:00Z" }), // NÃO
  // ⚠️ Nasceu da telemetria e já foi fechado: o alerta que o gerou não existe
  // mais, então `telemetriaAbsorvida` está vazia. Quem responde é o `[AUTO]`.
  chamado(9, "p3", { titulo: "[AUTO] Nível baixo detectado no dispositivo DEV-B",
                     status: "fechado", fechado_em: "2026-09-08T12:00:00Z" }),
  // ⚠️ Preventiva: P4 e, no fim do mês, com prazo estourado. Sai pela ORIGEM.
  chamado(10, "p4", { plano_manutencao_id: 77, sla_ttfr_estourado: true }),
];
ctx._alertasAbertos = [
  { id: 90, device_id: "DEV-A", tipo: "nivel_baixo", criado_em: "2026-09-08T09:00:00Z" },
];

const todos = ctx._alUnificar();
const doAlerta = todos.filter(ctx._alContaComoAlerta);
const chaves = (l) => l.map((it) => it.key).sort().join(",");

// ── O que a página desenha ───────────────────────────────────────────────
ok("P3 comum NÃO é alerta", !doAlerta.some((it) => it.key === "CH-3"));
ok("P4 comum NÃO é alerta", !doAlerta.some((it) => it.key === "CH-4"));
ok("P1 é alerta", doAlerta.some((it) => it.key === "CH-1"));
ok("P2 é alerta", doAlerta.some((it) => it.key === "CH-2"));
ok("P4 com prazo estourado É alerta", doAlerta.some((it) => it.key === "CH-5"));
ok("P3 que absorveu telemetria É alerta", doAlerta.some((it) => it.key === "CH-6"));
ok("P4 fechado não entra nem como resolvido", !doAlerta.some((it) => it.key === "CH-8"));
ok("P1 fechado continua na aba de resolvidos", doAlerta.some((it) => it.key === "CH-7"));
ok("chamado [AUTO] fechado continua na aba de resolvidos",
   doAlerta.some((it) => it.key === "CH-9"));
// ⚠️ O corte da preventiva é pela ORIGEM: este tem prazo estourado, que em
// qualquer outro chamado bastaria para virar alerta.
ok("preventiva NÃO é alerta nem com prazo estourado",
   !doAlerta.some((it) => it.key === "CH-10"));

// ⚠️ O alerta de telemetria absorvido não pode virar card próprio: quem aparece
// é o chamado, com o selo "+ telemetria".
ok("telemetria absorvida não vira card solto", !todos.some((it) => it.key === "TEL-90"));
ok("o chamado que a absorveu carrega o device",
   doAlerta.find((it) => it.key === "CH-6")?.device_id === "DEV-A");

// ── ⚠️ O CONTRATO QUE O BUG QUEBRAVA: desenhado === contado ──────────────
const ativosDesenhados = doAlerta.filter((it) => it.status === "ativo");
const ativosContados = ctx._alertasAtivosUnificados();
ok("a lista desenhada e a contada são a MESMA",
   chaves(ativosDesenhados) === chaves(ativosContados),
   `desenhada=[${chaves(ativosDesenhados)}] contada=[${chaves(ativosContados)}]`);
// ⚠️ QUATRO, não cinco: o alerta de telemetria foi ABSORVIDO pelo CH-6 e não
// conta em dobro. É exatamente o agrupamento que o `_alUnificar` existe para
// fazer — e a razão de o badge e a tabela terem de sair da mesma lista.
ok("são 4 ativos (P1, P2, P4-estourado, P3-com-telemetria) e nada mais",
   ativosContados.length === 4, "veio " + ativosContados.length);

// ⚠️ A REGRESSÃO EM SI: sem o filtro, `_alUnificar()` devolve todo chamado.
// Se algum dia alguém devolver o cru para o render, este teste cai aqui.
ok("sem o filtro, o cru traz os P3/P4 comuns (é o bug de 08/09)",
   todos.some((it) => it.key === "CH-3") && todos.some((it) => it.key === "CH-4"));
ok("e o filtro remove exatamente esses",
   todos.length - doAlerta.length === 4, // CH-3, CH-4, CH-8, CH-10
   `cru=${todos.length} filtrado=${doAlerta.length}`);

// ⚠️ E o render precisa aplicar o filtro. Checagem de FONTE, porque o
// `renderAlertas` mexe no DOM e não roda aqui — foi exatamente esta linha que
// estava errada.
const fonteRender = trecho("function renderAlertas() {");
ok("renderAlertas() filtra por _alContaComoAlerta",
   /_alUnificar\(\)\s*\.filter\(\s*_alContaComoAlerta\s*\)/.test(fonteRender),
   fonteRender.split("\n").find((l) => l.includes("_alUnificar()"))?.trim());

const falhas = r.filter((x) => !x.cond).length;
console.log(`\n${r.length - falhas}/${r.length}`);
process.exit(falhas ? 1 : 0);
