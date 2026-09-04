// As preventivas do mês no painel do operador: estado, escala e o desvio do
// roteiro do técnico.
//
//   node scripts/testes/preventivas-mes.test.js
//
// ⚠️ O QUE ELE PROVA de mais importante é a REGRA DA ESCALA: prédio escalado
// para outro técnico SAI do roteiro de quem responde pela zona. Se essa linha
// falhar, dois técnicos veem o mesmo prédio no app, os dois vão, e um perde a
// manhã — o defeito que a tela existe para evitar.
//
// ⚠️ ESCREVE NO BANCO DE TESTE e limpa tudo no `finally`.
require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const { pool } = require("../../src/db");
const { resolverDatabaseUrl } = require("../../src/db-url");
const P = require("../../src/services/preventivas.service");

const { alvo } = resolverDatabaseUrl();
if (alvo !== "TESTE") {
  console.error("Recusando rodar: o banco resolvido é " + alvo + ", não TESTE.");
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use("/operador", require("../../src/routes/operador.routes").operadorRouter);
app.use("/planos-manutencao", require("../../src/routes/planos-manutencao.routes").planosManutencaoRouter);

const r = [];
const ok = (nome, cond) => r.push([nome, cond]);

(async () => {
  const server = app.listen(0);
  const base = "http://127.0.0.1:" + server.address().port;
  const lixo = { planos: [], condos: [], chamados: [], tecnicos: [], usuarios: [], zonas: [] };

  try {
    const u = await pool.query(
      "SELECT id, role FROM usuarios WHERE role IN ('admin','gerente') ORDER BY id LIMIT 1"
    );
    if (!u.rows.length) throw new Error("nenhum usuário admin/gerente no banco de teste");
    const token = jwt.sign({ id: u.rows[0].id, role: u.rows[0].role }, process.env.JWT_SECRET, { expiresIn: "10m" });
    const H = { Authorization: "Bearer " + token, "Content-Type": "application/json" };

    const sufixo = String(Date.now()).slice(-8);
    const ZONA = "ZTeste" + sufixo;

    // ── Dois técnicos: um responde pela zona, o outro não ─────────────────
    const novoTecnico = async (nome) => {
      const t = await pool.query(
        "INSERT INTO tecnicos (nome, ativo) VALUES ($1, TRUE) RETURNING id", [nome]
      );
      lixo.tecnicos.push(t.rows[0].id);
      return t.rows[0].id;
    };
    const tecZona   = await novoTecnico("Téc Zona " + sufixo);
    const tecOutro  = await novoTecnico("Téc Outro " + sufixo);
    // ⚠️ A TABELA `tecnicos` É O QUADRO INTEIRO, não só quem vai a campo — em
    // produção são 6 técnicos, 3 gestores e 2 do administrativo na mesma
    // tabela. Este aqui existe para provar que ele NÃO é oferecido nem aceito.
    const gestor = await pool.query(
      "INSERT INTO tecnicos (nome, ativo, cargo) VALUES ($1, TRUE, 'gestor') RETURNING id",
      ["Gestor " + sufixo]
    );
    lixo.tecnicos.push(gestor.rows[0].id);
    const tecGestor = gestor.rows[0].id;

    await pool.query(
      "INSERT INTO planos_zona_responsavel (zona, tecnico_id) VALUES ($1, $2)", [ZONA, tecZona]
    );
    lixo.zonas.push(ZONA);

    // O técnico da zona precisa de usuário para bater no /meu-roteiro.
    const uTec = await pool.query(
      `INSERT INTO usuarios (nome, email, role, senha_hash)
       VALUES ($1, $2, 'tecnico', 'x') RETURNING id`,
      ["Téc Zona " + sufixo, "tec" + sufixo + "@teste.local"]
    );
    lixo.usuarios.push(uTec.rows[0].id);
    await pool.query("UPDATE tecnicos SET usuario_id = $1 WHERE id = $2", [uTec.rows[0].id, tecZona]);
    const tokenTec = jwt.sign({ id: uTec.rows[0].id, role: "tecnico" }, process.env.JWT_SECRET, { expiresIn: "10m" });
    const HT = { Authorization: "Bearer " + tokenTec, "Content-Type": "application/json" };

    // ── Quatro prédios na zona, um plano mensal em cada ───────────────────
    const hoje = new Date();
    const comp = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
    const dia = (n) => {
      const d = new Date(hoje.getFullYear(), hoje.getMonth(), n);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };

    const novoPlano = async (rot, proximaEm, zona) => {
      const c = await pool.query(
        `INSERT INTO condominios (nome, nome_fantasia, zona, ativo)
         VALUES ($1, $2, $3, TRUE) RETURNING id`,
        ["COND " + rot + " " + sufixo, "Ed. " + rot, zona]
      );
      lixo.condos.push(c.rows[0].id);
      const pl = await pool.query(
        `INSERT INTO planos_manutencao (condominio_id, titulo, periodicidade_dias, proxima_em, ativo)
         VALUES ($1, $2, 30, $3::date, TRUE) RETURNING id`,
        [c.rows[0].id, "Preventiva mensal " + rot, proximaEm]
      );
      lixo.planos.push(pl.rows[0].id);
      return { plano: pl.rows[0].id, condo: c.rows[0].id };
    };

    // ⚠️ TODOS VENCEM HOJE, e isso não é preguiça: o roteiro do app só mostra
    // planos vencendo em até `planos.roteiro_antecedencia_dias` (7 por padrão).
    // A primeira versão deste teste espalhou os quatro pelos dias 10, 12, 15 e
    // 18 do mês e o "escalado para outro SAI do roteiro" passou **por acaso** —
    // o plano nunca tinha estado lá, estava fora da janela. Vencendo hoje, os
    // quatro entram na janela e no mês, e o teste mede o que diz medir.
    const hojeStr = dia(hoje.getDate());
    const a = await novoPlano("A", hojeStr, ZONA);   // a fazer
    const b = await novoPlano("B", hojeStr, ZONA);   // vai ser escalado
    const c = await novoPlano("C", hojeStr, ZONA);   // vai ficar em campo
    const d = await novoPlano("D", hojeStr, ZONA);   // vai ser dada como feita

    // ── A tela do mês ─────────────────────────────────────────────────────
    const tela = async () => (await (await fetch(base + "/operador/preventivas?mes=" + comp, { headers: H })).json());
    let t = await tela();
    const doPlano = (dados, id) => dados.planos.find((p) => p.id === id);

    ok("a tela devolve o mês pedido", t.mes === comp);
    ok("os quatro planos do mês aparecem",
       [a, b, c, d].every((x) => !!doPlano(t, x.plano)));
    ok("sem escala, o estado é 'a fazer'", doPlano(t, a.plano).estado === "a_fazer");
    ok("e o responsável cai para o técnico da zona",
       doPlano(t, a.plano).tecnico_id === tecZona && doPlano(t, a.plano).tecnico_origem === "zona");
    ok("a equipe vem junto, para o diálogo de escala",
       Array.isArray(t.tecnicos) && t.tecnicos.some((x) => x.id === tecOutro));
    // ⚠️ O DEFEITO DE 04/09: a barra de despacho oferecia os 11 colaboradores
    // ativos, não os 6 técnicos. "está aparecendo todos os colaboradores, não
    // apenas os técnicos" — a query da equipe tinha só `ativo = TRUE`, sem o
    // `cargo` que o `SQL_EQUIPE` e o `resolverTecnico` já exigiam.
    ok("e quem não é técnico fica de fora dela",
       !t.tecnicos.some((x) => x.id === tecGestor));

    // ── Escalar: em lote, para um técnico que NÃO é o da zona ─────────────
    const escalar = (ids, tecnico) => fetch(base + "/operador/preventivas/atribuir", {
      method: "POST", headers: H,
      body: JSON.stringify({ plano_ids: ids, tecnico_id: tecnico, mes: comp }),
    });

    const resp = await escalar([b.plano], tecOutro);
    const jResp = await resp.json();
    ok("escala um lote (200)", resp.status === 200 && jResp.atribuidos === 1);

    t = await tela();
    ok("o escalado muda de estado", doPlano(t, b.plano).estado === "escalada");
    ok("e passa a ser do técnico escalado, não do da zona",
       doPlano(t, b.plano).tecnico_id === tecOutro &&
       doPlano(t, b.plano).tecnico_origem === "escala");
    ok("a tela guarda quem escalou", !!doPlano(t, b.plano).atribuido_por_nome);

    // ⚠️ A REGRA QUE IMPORTA: escalar é DESVIAR, não acrescentar.
    const roteiro = async () => (await (await fetch(base + "/planos-manutencao/meu-roteiro", { headers: HT })).json());
    let rot = await roteiro();
    const noRoteiro = (id) => rot.planos.some((p) => p.id === id);

    ok("o técnico da zona continua vendo o que não foi escalado", noRoteiro(a.plano));
    ok("e o prédio escalado para OUTRO sai do roteiro dele", !noRoteiro(b.plano));

    // ⚠️ A asserção acima só vale se o prédio ESTAVA no roteiro antes — senão
    // ela passa por ausência, não por regra. Este é o controle: um plano igual
    // ao B, na mesma zona e no mesmo dia, sem escala nenhuma.
    ok("(controle) sem escala, um prédio igual continua no roteiro", noRoteiro(c.plano));

    // O contrário: escalar para o próprio técnico da zona não tira nada.
    await escalar([a.plano], tecZona);
    rot = await roteiro();
    ok("escalado para mim continua no meu roteiro", noRoteiro(a.plano));
    ok("e vem marcado como escalado", rot.planos.find((p) => p.id === a.plano).escalado === true);

    // Reescalar o mesmo prédio (o caso do técnico que entrou de férias).
    const reesc = await escalar([b.plano], tecZona);
    ok("reescalar não estoura na chave primária", reesc.status === 200);
    rot = await roteiro();
    ok("e o prédio volta para o roteiro de quem recebeu", noRoteiro(b.plano));

    // Desescalar devolve para a régua da zona.
    const des = await escalar([b.plano], null);
    ok("desescalar responde 200", des.status === 200);
    t = await tela();
    ok("e o responsável volta a vir da zona",
       doPlano(t, b.plano).tecnico_origem === "zona" && doPlano(t, b.plano).estado === "a_fazer");

    // ── Em campo e feita ──────────────────────────────────────────────────
    const chAberto = await pool.query(
      `INSERT INTO chamados (condominio_id, titulo, descricao, prioridade, categoria, status, plano_manutencao_id)
       VALUES ($1, 'Preventiva C', 'em campo', 'p4', 'manutencao', 'aberto', $2) RETURNING id`,
      [c.condo, c.plano]
    );
    lixo.chamados.push(chAberto.rows[0].id);

    const chFechado = await pool.query(
      `INSERT INTO chamados (condominio_id, titulo, descricao, prioridade, categoria, status, plano_manutencao_id, fechado_em)
       VALUES ($1, 'Preventiva D', 'feita', 'p4', 'manutencao', 'fechado', $2, NOW()) RETURNING id`,
      [d.condo, d.plano]
    );
    lixo.chamados.push(chFechado.rows[0].id);

    t = await tela();
    ok("chamado aberto → em campo", doPlano(t, c.plano).estado === "em_campo");
    ok("chamado fechado no mês → feita", doPlano(t, d.plano).estado === "feita");

    // ⚠️ `ultima_em` no mês SEM chamado também conta como feita — é a execução
    // anterior a este módulo. Mas NÃO ganha de um chamado aberto.
    await pool.query("UPDATE planos_manutencao SET ultima_em = CURRENT_DATE WHERE id = $1", [a.plano]);
    await pool.query("UPDATE planos_manutencao SET ultima_em = CURRENT_DATE WHERE id = $1", [c.plano]);
    t = await tela();
    ok("ultima_em no mês, sem chamado → feita", doPlano(t, a.plano).estado === "feita");
    ok("mas chamado ABERTO ganha de ultima_em", doPlano(t, c.plano).estado === "em_campo");

    // ── O atraso ──────────────────────────────────────────────────────────
    await pool.query(
      "UPDATE planos_manutencao SET proxima_em = ($1::date - INTERVAL '40 days') WHERE id = $2",
      [P.competenciaDe(comp), b.plano]
    );
    t = await tela();
    ok("preventiva de mês anterior aparece como atrasada",
       doPlano(t, b.plano) && doPlano(t, b.plano).atrasada === true);

    // ── O plano que JA RODOU no mes continua na tela ──────────────────────
    // ⚠️ O DEFEITO DE 04/09/2026, e ele esvaziava a tela inteira. O job rola
    // `proxima_em` para o ciclo seguinte no instante em que abre o chamado —
    // então, minutos depois de gerar as preventivas do mês, `proxima_em` já
    // aponta para o mês QUE VEM e o filtro por ela sozinho não achava mais
    // nada. Em produção: 69 chamados abertos e a competência de setembro
    // listando ZERO plano. "na página do operador está tudo no mês de outubro".
    const rolado = await pool.query(
      `UPDATE planos_manutencao
          SET proxima_em = ($1::date + INTERVAL '1 month' + INTERVAL '3 days')::date,
              ultima_em  = $1::date
        WHERE id = $2 RETURNING id`,
      [comp + "-01", d.plano]
    );
    ok("(preparo) o plano rolou para o mês que vem", rolado.rowCount === 1);

    const depois = await (await fetch(base + "/operador/preventivas?mes=" + comp, { headers: H })).json();
    const rl = depois.planos.find((p) => p.id === d.plano);
    ok("plano que já rodou no mês continua na competência dele", !!rl);
    // Chamado aberto ganha de tudo (regra do `estadoDa`); sem ele, `ultima_em`
    // no mês faz a linha sair como feita. Os dois provam que ela EXISTE.
    ok("e sai como em campo ou feita, nunca sumindo", rl && ["em_campo", "feita"].includes(rl.estado));
    ok("e NÃO conta como atrasada — a data já é do mês que vem", rl && !rl.atrasada);

    // ── As recusas ────────────────────────────────────────────────────────
    const semIds = await fetch(base + "/operador/preventivas/atribuir", {
      method: "POST", headers: H, body: JSON.stringify({ plano_ids: [], tecnico_id: tecZona }) });
    ok("lote vazio → 400", semIds.status === 400);

    // ⚠️ 400, NÃO 404 (04/09/2026). Quem valida passou a ser o
    // `resolverTecnico` — a mesma regra do "Novo chamado" e de Aprovados, que
    // já respondiam 400 —, e o `tecnico_id` é campo do CORPO: pedido malformado,
    // não recurso ausente. A rota tinha checagem própria, e era ela que deixava
    // passar quem não é técnico.
    const tecMau = await escalar([a.plano], 999999999);
    ok("técnico inexistente → 400", tecMau.status === 400);

    // A outra metade do mesmo defeito: a tela parou de OFERECER o gestor, e a
    // gravação precisa RECUSAR — senão um POST à mão escala uma preventiva
    // para o administrativo.
    const escGestor = await escalar([a.plano], tecGestor);
    ok("escalar para quem não é técnico → 400", escGestor.status === 400);

    const mesMau = await fetch(base + "/operador/preventivas?mes=setembro", { headers: H });
    ok("mês fora do formato → 400", mesMau.status === 400);

    const semToken = await fetch(base + "/operador/preventivas");
    ok("sem token → 401", semToken.status === 401);

    // ── O service ─────────────────────────────────────────────────────────
    ok("competência é sempre o dia 1", P.competenciaDe("2026-09") === "2026-09-01");
    ok("mês inválido cai no mês corrente", /^\d{4}-\d{2}-01$/.test(P.competenciaDe("xxx")));
    ok("competenciaValida recusa mês 13", !P.competenciaValida("2026-13"));
    ok("e recusa data completa", !P.competenciaValida("2026-09-01"));
  } catch (e) {
    console.error("ERRO:", e.message);
    process.exitCode = 1;
  } finally {
    for (const id of lixo.chamados) await pool.query("DELETE FROM chamados WHERE id=$1", [id]).catch(() => {});
    for (const id of lixo.planos)   await pool.query("DELETE FROM planos_manutencao WHERE id=$1", [id]).catch(() => {});
    for (const z of lixo.zonas)     await pool.query("DELETE FROM planos_zona_responsavel WHERE zona=$1", [z]).catch(() => {});
    for (const id of lixo.condos)   await pool.query("DELETE FROM condominios WHERE id=$1", [id]).catch(() => {});
    for (const id of lixo.tecnicos) await pool.query("DELETE FROM tecnicos WHERE id=$1", [id]).catch(() => {});
    for (const id of lixo.usuarios) await pool.query("DELETE FROM usuarios WHERE id=$1", [id]).catch(() => {});
    server.close();
    await pool.end();
  }

  const falhas = r.filter(([, c]) => !c);
  for (const [n, c] of r) console.log((c ? "✓" : "✗") + " " + n);
  console.log("\n" + (r.length - falhas.length) + "/" + r.length + " passaram");
  if (falhas.length) process.exitCode = 1;
})();
