// Teste da rota POST /equipamentos/:id/desfazer-cadastro — o card "Reaproveitar
// etiqueta" da tela de Equipamentos. Roda com
// `node scripts/testes/desfazer-cadastro-etiqueta.test.js`.
//
// ⚠️ POR QUE ROTA DE VERDADE: o CLAUDE.md registra que rota que grava só se
// prova exercitando o endpoint. E aqui há duas regras que, se erradas, ninguém
// vê na hora — a etiqueta com histórico de verdade tem que RECUSAR voltar a
// ficar em branco, e a que volta tem que voltar LIMPA (condomínio, dados e
// linha do tempo), senão a próxima bomba herda o cadastro da anterior.
//
// ⚠️ ESCREVE NO BANCO DE TESTE (`DATABASE_URL_TESTE` do `.env`) e limpa o que
// criou no `finally`.
require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const { pool } = require("../../src/db");
const { resolverDatabaseUrl } = require("../../src/db-url");
const { alvo } = resolverDatabaseUrl();

if (alvo !== "TESTE") {
  console.error(`Recusando rodar: o banco resolvido é ${alvo}, não TESTE.`);
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use("/equipamentos", require("../../src/routes/equipamentos.routes").equipamentosRouter);

const r = [];
const ok = (nome, cond) => r.push([nome, cond]);

(async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const criados = [];

  try {
    const admin = (await pool.query(
      "SELECT id FROM usuarios WHERE role = 'admin' ORDER BY id LIMIT 1"
    )).rows[0];
    const gerente = (await pool.query(
      "SELECT id FROM usuarios WHERE role = 'gerente' ORDER BY id LIMIT 1"
    )).rows[0];
    const condo = (await pool.query("SELECT id FROM condominios ORDER BY id LIMIT 1")).rows[0];
    if (!admin) throw new Error("nenhum usuário admin no banco de teste");
    if (!condo) throw new Error("nenhum condomínio no banco de teste");

    const tok = (id, role) =>
      jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "10m" });
    const H = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tok(admin.id, "admin")}`,
    };

    const novaEtiqueta = async (n) => {
      const codigo = `TST${String(Date.now()).slice(-4)}${n}`;
      const id = (await pool.query(
        `INSERT INTO equipamentos (codigo, lote, status) VALUES ($1, 'LTESTDESF', 'etiqueta_livre')
         RETURNING id`,
        [codigo]
      )).rows[0].id;
      criados.push(id);
      return { id, codigo };
    };
    const desfazer = (id, codigo, headers = H) =>
      fetch(`${base}/equipamentos/${id}/desfazer-cadastro`, {
        method: "POST", headers, body: JSON.stringify({ codigo }),
      });

    // A etiqueta do caso feliz passa pelo vincular DE VERDADE: é ele que
    // preenche os campos que o desfazer precisa zerar, e escrever o UPDATE na
    // mão aqui testaria o teste, não a rota.
    const a = await novaEtiqueta(1);
    const rVinc = await fetch(`${base}/equipamentos/${a.id}/vincular`, {
      method: "POST", headers: H,
      body: JSON.stringify({
        condominio_id: condo.id, destino: "instalado",
        tipo: "bomba", apelido: "Bomba de teste", marca: "Schneider",
      }),
    });
    ok("vincular → 200 (preparo)", rVinc.status === 200);

    // ── Permissão ─────────────────────────────────────────────────────────
    const rSem = await fetch(`${base}/equipamentos/${a.id}/desfazer-cadastro`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo: a.codigo }),
    });
    ok("sem token → 401", rSem.status === 401);

    if (gerente) {
      const rGer = await desfazer(a.id, a.codigo, {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tok(gerente.id, "gerente")}`,
      });
      ok("gerente → 403 (só admin master)", rGer.status === 403);
    } else {
      ok("gerente → 403 (pulado: sem gerente no banco)", true);
    }

    const rTec = await desfazer(a.id, a.codigo, {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tok(admin.id, "tecnico")}`,
    });
    ok("técnico → 403", rTec.status === 403);

    // ── Bordas ────────────────────────────────────────────────────────────
    const r404 = await desfazer(999999999, "AAAA1111");
    ok("id inexistente → 404", r404.status === 404);

    const rCod = await desfazer(a.id, "ZZZZ9999");
    ok("código que não confere → 400", rCod.status === 400);
    const aindaVinculada = (await pool.query(
      "SELECT status FROM equipamentos WHERE id = $1", [a.id]
    )).rows[0].status;
    ok("e não mexeu no equipamento", aindaVinculada === "instalado");

    // ── O caso que importa: volta a ficar em branco, e volta LIMPA ─────────
    const res = await desfazer(a.id, a.codigo);
    const body = await res.json();
    ok("admin master → 200", res.status === 200);
    ok("apagou a movimentação do cadastro", body.movimentacoes_apagadas === 1);

    const eq = (await pool.query(
      `SELECT codigo, lote, status, ativo, condominio_id, vinculado_em, apelido, marca, tipo
         FROM equipamentos WHERE id = $1`, [a.id]
    )).rows[0];
    ok("status volta a etiqueta_livre", eq.status === "etiqueta_livre");
    ok("condomínio zerado", eq.condominio_id === null);
    ok("dados do cadastro zerados", !eq.apelido && !eq.marca && !eq.tipo);
    ok("vinculado_em zerado", eq.vinculado_em === null);
    ok("volta ativa", eq.ativo === true);
    ok("o código continua o mesmo", eq.codigo === a.codigo);
    ok("o lote continua o mesmo", eq.lote === "LTESTDESF");

    const movs = (await pool.query(
      `SELECT COUNT(*)::int AS n FROM equipamento_movimentacoes WHERE equipamento_id = $1`,
      [a.id]
    )).rows[0].n;
    ok("linha do tempo vazia", movs === 0);

    // Repetir em etiqueta já em branco não quebra nem inventa movimentação.
    const res2 = await desfazer(a.id, a.codigo);
    ok("repetir → 200", res2.status === 200);

    // ── A regra que protege o histórico ───────────────────────────────────
    const b = await novaEtiqueta(2);
    await pool.query(
      `UPDATE equipamentos SET status = 'oficina', condominio_id = $2 WHERE id = $1`,
      [b.id, condo.id]
    );
    await pool.query(
      `INSERT INTO equipamento_movimentacoes (equipamento_id, tipo, status_novo, usuario_id, usuario_nome)
       VALUES ($1, 'entrada_oficina', 'oficina', $2, 'teste')`,
      [b.id, admin.id]
    );
    const rHist = await desfazer(b.id, b.codigo);
    const bodyHist = await rHist.json();
    ok("com histórico → 409", rHist.status === 409);
    ok("diz o que impede", bodyHist.impedimentos?.movimentacoes === 1);
    const bDepois = (await pool.query(
      `SELECT e.status, (SELECT COUNT(*)::int FROM equipamento_movimentacoes m
                          WHERE m.equipamento_id = e.id) AS movs
         FROM equipamentos e WHERE e.id = $1`, [b.id]
    )).rows[0];
    ok("e não encostou no equipamento", bDepois.status === "oficina" && bDepois.movs === 1);

    // Foto também segura, mesmo com a movimentação sendo só a do cadastro.
    const c = await novaEtiqueta(3);
    await pool.query(
      `UPDATE equipamentos SET status = 'instalado', condominio_id = $2 WHERE id = $1`,
      [c.id, condo.id]
    );
    await pool.query(
      `INSERT INTO equipamento_movimentacoes (equipamento_id, tipo, status_novo, usuario_id, usuario_nome)
       VALUES ($1, 'cadastro', 'instalado', $2, 'teste')`,
      [c.id, admin.id]
    );
    await pool.query(
      `INSERT INTO equipamento_fotos (equipamento_id, dados_base64) VALUES ($1, 'data:image/png;base64,AA==')`,
      [c.id]
    );
    const rFoto = await desfazer(c.id, c.codigo);
    const bodyFoto = await rFoto.json();
    ok("com foto → 409", rFoto.status === 409);
    ok("aponta a foto", bodyFoto.impedimentos?.fotos === 1);
  } catch (e) {
    console.error("ERRO:", e.message);
    process.exitCode = 1;
  } finally {
    for (const id of criados) {
      await pool.query("DELETE FROM equipamento_fotos WHERE equipamento_id=$1", [id]).catch(() => {});
      await pool.query("DELETE FROM equipamento_movimentacoes WHERE equipamento_id=$1", [id]).catch(() => {});
      await pool.query("DELETE FROM equipamentos WHERE id=$1", [id]).catch(() => {});
    }
    server.close();
    await pool.end();
  }

  const falhas = r.filter(([, c]) => !c);
  for (const [n, c] of r) console.log(`${c ? "✓" : "✗"} ${n}`);
  console.log(`\n${r.length - falhas.length}/${r.length} passaram`);
  if (falhas.length) process.exitCode = 1;
})();
