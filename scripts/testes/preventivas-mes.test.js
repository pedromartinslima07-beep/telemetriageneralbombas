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

    // ⚠️ UM SEGUNDO TÉCNICO COM LOGIN, e ele é o que prova a regra: `tecOutro`
    // NÃO responde por zona nenhuma, então só a ESCALA pode autorizá-lo.
    const uTec2 = await pool.query(
      `INSERT INTO usuarios (nome, email, role, senha_hash)
       VALUES ($1, $2, 'tecnico', 'x') RETURNING id`,
      ["Téc Outro " + sufixo, "tec2" + sufixo + "@teste.local"]
    );
    lixo.usuarios.push(uTec2.rows[0].id);
    await pool.query("UPDATE tecnicos SET usuario_id = $1 WHERE id = $2", [uTec2.rows[0].id, tecOutro]);
    const HT2 = {
      Authorization: "Bearer " + jwt.sign({ id: uTec2.rows[0].id, role: "tecnico" }, process.env.JWT_SECRET, { expiresIn: "10m" }),
      "Content-Type": "application/json",
    };

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
      // ⚠️ COM TECNICO, e isso passou a ser obrigatorio em 04/09/2026: "em
      // campo" e chamado aberto **com alguem nele**. O job cria o chamado do
      // mes sem responsavel, e chamado orfao nao e servico andando — e servico
      // esperando alguem. A fixture sem tecnico virou o caso do bloco
      // "chamado aberto SEM tecnico volta a ser despachavel", la embaixo.
      `INSERT INTO chamados (condominio_id, titulo, descricao, prioridade, categoria, status, plano_manutencao_id, tecnico_id)
       VALUES ($1, 'Preventiva C', 'em campo', 'p4', 'manutencao', 'aberto', $2, $3) RETURNING id`,
      [c.condo, c.plano, tecZona]
    );
    lixo.chamados.push(chAberto.rows[0].id);

    const chFechado = await pool.query(
      `INSERT INTO chamados (condominio_id, titulo, descricao, prioridade, categoria, status, plano_manutencao_id, fechado_em)
       VALUES ($1, 'Preventiva D', 'feita', 'p4', 'manutencao', 'fechado', $2, NOW()) RETURNING id`,
      [d.condo, d.plano]
    );
    lixo.chamados.push(chFechado.rows[0].id);

    t = await tela();
    ok("chamado aberto COM técnico → em campo", doPlano(t, c.plano).estado === "em_campo");
    ok("chamado fechado no mês → feita", doPlano(t, d.plano).estado === "feita");

    // ⚠️ `ultima_em` no mês SEM chamado também conta como feita — é a execução
    // anterior a este módulo. Mas NÃO ganha de um chamado aberto.
    await pool.query("UPDATE planos_manutencao SET ultima_em = CURRENT_DATE WHERE id = $1", [a.plano]);
    await pool.query("UPDATE planos_manutencao SET ultima_em = CURRENT_DATE WHERE id = $1", [c.plano]);
    t = await tela();
    ok("ultima_em no mês, sem chamado → feita", doPlano(t, a.plano).estado === "feita");
    ok("mas chamado ABERTO COM TECNICO ganha de ultima_em", doPlano(t, c.plano).estado === "em_campo");

    // ── O atraso ──────────────────────────────────────────────────────────
    await pool.query(
      "UPDATE planos_manutencao SET proxima_em = ($1::date - INTERVAL '40 days') WHERE id = $2",
      [P.competenciaDe(comp), b.plano]
    );
    t = await tela();
    ok("preventiva de mês anterior aparece como atrasada",
       doPlano(t, b.plano) && doPlano(t, b.plano).atrasada === true);

    // ── Chamado aberto SEM técnico não é "em campo" ───────────────────────
    // ⚠️ O DEFEITO DE 04/09/2026, e ele travava a tela inteira. O job cria o
    // chamado do mês sozinho e sem responsável; a versão anterior lia qualquer
    // chamado aberto como "em campo", e a tela ESCONDE a caixa de marcar, o
    // botão da zona e a barra de despacho nesse estado. Medido em produção: 69
    // planos "em campo" com ZERO técnico, e o operador sem a única ação da
    // tela. "por que não está aparecendo para atribuir técnico?"
    await pool.query("UPDATE chamados SET tecnico_id = NULL WHERE id = $1", [chAberto.rows[0].id]);
    let tEC = await tela();
    ok("chamado aberto SEM técnico volta a ser despachável",
       doPlano(tEC, c.plano) && doPlano(tEC, c.plano).estado !== "em_campo");

    await pool.query("UPDATE chamados SET tecnico_id = $2 WHERE id = $1",
                     [chAberto.rows[0].id, tecZona]);
    tEC = await tela();
    ok("e com técnico volta a ser em campo", doPlano(tEC, c.plano).estado === "em_campo");

    // ── Despachar ADOTA o chamado que já existe ───────────────────────────
    // Sem isto o operador escalava e o serviço não chegava a ninguém: a escala
    // ia para planos_atribuicoes e o chamado seguia órfão, fora do app do
    // técnico e fora da fila do turno.
    await pool.query("UPDATE chamados SET tecnico_id = NULL WHERE id = $1", [chAberto.rows[0].id]);
    const rAdota = await escalar([c.plano], tecOutro);
    ok("escalar responde 200", rAdota.status === 200);
    const corpo = await rAdota.json();
    ok("e diz quantos chamados mudaram de dono", corpo.chamados_atualizados === 1);
    const dono = await pool.query("SELECT tecnico_id FROM chamados WHERE id = $1", [chAberto.rows[0].id]);
    ok("o chamado aberto passou para o técnico escalado", dono.rows[0].tecnico_id === tecOutro);
    const hist = await pool.query(
      `SELECT count(*)::int n FROM historico_chamados
        WHERE chamado_id = $1 AND campo_alterado = 'tecnico_id'`, [chAberto.rows[0].id]);
    ok("e o histórico do chamado registrou a troca", hist.rows[0].n >= 1);

    // Desescalar devolve o chamado para "esperando alguém".
    await escalar([c.plano], null);
    const semDono = await pool.query("SELECT tecnico_id FROM chamados WHERE id = $1", [chAberto.rows[0].id]);
    ok("desescalar limpa o técnico do chamado também", semDono.rows[0].tecnico_id === null);

    // ── O técnico ESCALADO consegue iniciar (04/09/2026) ──────────────────
    // ⚠️ Relato do Pedro: escalou uma preventiva à mão para um técnico no painel
    // do operador, o prédio APARECEU no roteiro dele, e ao tocar "Iniciar" o app
    // respondeu "você não é o responsável pela zona deste plano".
    //
    // A causa: o `POST /:id/executar-agora` só olhava `planos_zona_responsavel`.
    // O `/meu-roteiro` passou a considerar a escala em 03/09 e a rota de
    // gravação não acompanhou — a tela mostrava o serviço e a gravação recusava.
    // É a divergência que o `SQL_EQUIPE` do operador avisa em outro lugar do
    // sistema: quem OFERECE e quem GRAVA têm de responder igual.
    await escalar([b.plano], tecOutro);
    const iniciarEsc = await fetch(base + `/planos-manutencao/${b.plano}/executar-agora`, {
      method: "POST", headers: HT2,
    });
    const corpoEsc = await iniciarEsc.clone().json().catch(() => ({}));
    if (iniciarEsc.status !== 200) console.log("    →", iniciarEsc.status, JSON.stringify(corpoEsc));
    // ⚠️ E ESTE PLANO ESTÁ ATRASADO (o bloco do atraso, acima, jogou a
    // `proxima_em` dele 40 dias para trás). Não é detalhe: é o caso em que as
    // duas competências divergem — a escala é de HOJE, o mês da `proxima_em` é
    // o passado. Foi ele que expôs a segunda metade do defeito.
    ok("o técnico ESCALADO consegue iniciar, mesmo sem ser da zona",
       iniciarEsc.status === 200);
    if (iniciarEsc.status === 200) {
      const jj = await iniciarEsc.json();
      if (jj.chamado_id) lixo.chamados.push(jj.chamado_id);
    }

    // ⚠️ E O INVERSO, que ENDURECE a regra: escalado para OUTRO, o responsável
    // da ZONA perde o acesso. Antes esta rota deixava passar — os dois iriam ao
    // prédio, e um perderia a manhã. É o "escalar é DESVIAR, não acrescentar"
    // valendo também na gravação, não só na listagem.
    await escalar([a.plano], tecOutro);
    const intruso = await fetch(base + `/planos-manutencao/${a.plano}/executar-agora`, {
      method: "POST", headers: HT,
    });
    ok("e o da ZONA é recusado no que foi desviado para outro",
       intruso.status === 403, "status " + intruso.status);
    await escalar([a.plano], null);

    // ── A preventiva NAO polui a fila do turno ────────────────────────────
    // ⚠️ Pedido do Pedro (04/09/2026): "não é pra as preventivas ficar na tela
    // do turno igual está agora, quero que apareça só no momento que o técnico
    // começar a rota para atender". Medido em produção naquele dia: a fila
    // tinha 73 itens e 69 eram preventiva recém-gerada pelo job — os 4 chamados
    // que pediam alguém de verdade ficavam sob 95% de ruído.
    //
    // O sinal de "começou" é o `em_atendimento`, posto pelo "Iniciar" do app.
    // ⚠️ A CHAVE E `fila`, nao `chamados` — e olhar a chave errada faz o teste
    // PASSAR por acidente (lista vazia = "não está lá"). Aconteceu ao escrever
    // este bloco: a primeira asserção passou verde com o payload inteiro fora.
    const naFila = async (id) => {
      const d = await (await fetch(base + "/operador/fila", { headers: H })).json();
      if (!Array.isArray(d.fila)) throw new Error("payload sem `fila`: " + Object.keys(d));
      return d.fila.some((x) => x.id === id);
    };
    ok("preventiva ABERTA fica fora da fila do turno", !(await naFila(chAberto.rows[0].id)));

    await pool.query("UPDATE chamados SET status='em_atendimento' WHERE id=$1", [chAberto.rows[0].id]);
    ok("e ENTRA assim que o técnico começa", await naFila(chAberto.rows[0].id));

    // ⚠️ O corte é pela ORIGEM, não pela prioridade: preventiva é P4, mas nem
    // todo P4 é preventiva, e serviço avulso de baixa urgência tem de aparecer.
    const avulso = await pool.query(
      `INSERT INTO chamados (condominio_id, titulo, descricao, prioridade, categoria, status)
       VALUES ($1, 'Avulso P4', 'sem plano', 'p4', 'manutencao', 'aberto') RETURNING id`,
      [c.condo]
    );
    lixo.chamados.push(avulso.rows[0].id);
    ok("chamado avulso P4 (sem plano) continua na fila", await naFila(avulso.rows[0].id));

    await pool.query("UPDATE chamados SET status='aberto' WHERE id=$1", [chAberto.rows[0].id]);

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
