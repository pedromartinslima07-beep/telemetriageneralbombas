const express = require("express");
const { pool } = require("../db");
const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");

const router = express.Router();

const TIPOS_SERVICO = [
  "retirada_equipamento", "vistoria_contrato", "visita_tecnica", "devolucao",
  "limpeza_piscina", "limpeza_caixas", "chamado_emergencial",
  "preventiva_mensal", "instalacao_pecas",
];

const RECEBIDO_TIPOS = ["gestor", "sindico", "portaria"];
const SERVICO_RESULTADOS = ["resolvido", "paliativo", "agravado"];
const FOTO_TIPOS = ["antes", "depois", "geral"];

// POST /ordens-servico — cria rascunho. Aceita { chamado_id } ou { condominio_id, tecnico_id? }
router.post("/", authRequired, adminOnly, async (req, res) => {
  const { chamado_id, condominio_id, tecnico_id } = req.body || {};

  const cid = chamado_id ? Number(chamado_id) : null;
  const condInicial = condominio_id ? Number(condominio_id) : null;
  const tecInicial = tecnico_id ? Number(tecnico_id) : null;

  if (!cid && !condInicial) {
    return res.status(400).json({ error: "É necessário chamado_id ou condominio_id" });
  }

  try {
    let condFinal = condInicial;
    let tecFinal = tecInicial;

    if (cid) {
      const ch = await pool.query(
        `SELECT condominio_id, tecnico_id FROM chamados WHERE id = $1`,
        [cid]
      );
      if (ch.rows.length === 0) {
        return res.status(400).json({ error: "chamado_id não existe" });
      }
      if (!condFinal) condFinal = ch.rows[0].condominio_id;
      if (!tecFinal) tecFinal = ch.rows[0].tecnico_id;
    }

    const result = await pool.query(
      `INSERT INTO ordens_servico (numero, chamado_id, condominio_id, tecnico_id)
       VALUES (
         'OS-' || EXTRACT(YEAR FROM NOW())::text || '-' || LPAD(nextval('os_numero_seq')::text, 4, '0'),
         $1, $2, $3
       )
       RETURNING *`,
      [cid, condFinal, tecFinal]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("[ordens-servico] POST /:", err);
    return res.status(500).json({ error: "Erro ao criar O.S." });
  }
});

// GET /ordens-servico — lista com filtros opcionais
router.get("/", authRequired, adminOnly, async (req, res) => {
  const { chamado_id, condominio_id, tecnico_id, finalizada } = req.query;
  const conditions = [];
  const values = [];

  if (chamado_id) { values.push(Number(chamado_id)); conditions.push(`os.chamado_id = $${values.length}`); }
  if (condominio_id) { values.push(Number(condominio_id)); conditions.push(`os.condominio_id = $${values.length}`); }
  if (tecnico_id) { values.push(Number(tecnico_id)); conditions.push(`os.tecnico_id = $${values.length}`); }
  if (finalizada === "true") conditions.push("os.finalizada_em IS NOT NULL");
  if (finalizada === "false") conditions.push("os.finalizada_em IS NULL");

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const result = await pool.query(
      `SELECT
         os.id, os.numero, os.chamado_id, os.condominio_id, os.tecnico_id,
         os.tipos_servico, os.servico_realizado, os.necessario_retorno,
         os.chegada_em, os.saida_em, os.criado_em, os.finalizada_em,
         c.nome AS condominio_nome,
         t.nome AS tecnico_nome
       FROM ordens_servico os
       LEFT JOIN condominios c ON c.id = os.condominio_id
       LEFT JOIN tecnicos    t ON t.id = os.tecnico_id
       ${where}
       ORDER BY os.criado_em DESC
       LIMIT 200`,
      values
    );
    return res.json(result.rows);
  } catch (err) {
    console.error("[ordens-servico] GET /:", err);
    return res.status(500).json({ error: "Erro ao listar O.S." });
  }
});

// GET /ordens-servico/:id — detalhe completo (com fotos e peças)
router.get("/:id", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  try {
    const osRes = await pool.query(
      `SELECT
         os.*,
         c.nome AS condominio_nome,
         c.endereco, c.bairro, c.cidade, c.uf, c.cep,
         t.nome AS tecnico_nome,
         t.telefone AS tecnico_telefone
       FROM ordens_servico os
       LEFT JOIN condominios c ON c.id = os.condominio_id
       LEFT JOIN tecnicos    t ON t.id = os.tecnico_id
       WHERE os.id = $1`,
      [id]
    );
    if (osRes.rows.length === 0) return res.status(404).json({ error: "O.S. não encontrada" });

    const [fotos, pecas] = await Promise.all([
      pool.query(`SELECT * FROM os_fotos WHERE os_id = $1 ORDER BY criado_em ASC`, [id]),
      pool.query(`SELECT * FROM os_pecas WHERE os_id = $1 ORDER BY id ASC`, [id]),
    ]);

    return res.json({ ...osRes.rows[0], fotos: fotos.rows, pecas: pecas.rows });
  } catch (err) {
    console.error("[ordens-servico] GET /:id:", err);
    return res.status(500).json({ error: "Erro ao buscar O.S." });
  }
});

// PATCH /ordens-servico/:id — atualiza campos do formulário
router.patch("/:id", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  const b = req.body || {};
  const sets = [];
  const values = [];

  if (b.tipos_servico !== undefined) {
    if (!Array.isArray(b.tipos_servico)) {
      return res.status(400).json({ error: "tipos_servico deve ser array" });
    }
    for (const t of b.tipos_servico) {
      if (!TIPOS_SERVICO.includes(t)) {
        return res.status(400).json({ error: `tipo_servico inválido: ${t}` });
      }
    }
    values.push(b.tipos_servico);
    sets.push(`tipos_servico = $${values.length}`);
  }

  for (const f of ["chegada_em", "saida_em"]) {
    if (b[f] !== undefined) {
      const v = b[f] || null;
      if (v !== null && isNaN(new Date(v).getTime())) {
        return res.status(400).json({ error: `${f} inválido` });
      }
      values.push(v);
      sets.push(`${f} = $${values.length}`);
    }
  }

  for (const f of ["chegada_lat", "chegada_lng", "saida_lat", "saida_lng"]) {
    if (b[f] !== undefined) {
      const n = b[f] !== null ? Number(b[f]) : null;
      if (n !== null && !Number.isFinite(n)) {
        return res.status(400).json({ error: `${f} inválido` });
      }
      values.push(n);
      sets.push(`${f} = $${values.length}`);
    }
  }

  if (b.recebido_nome !== undefined) {
    values.push(b.recebido_nome || null);
    sets.push(`recebido_nome = $${values.length}`);
  }
  if (b.recebido_tipo !== undefined) {
    if (b.recebido_tipo && !RECEBIDO_TIPOS.includes(b.recebido_tipo)) {
      return res.status(400).json({ error: `recebido_tipo deve ser: ${RECEBIDO_TIPOS.join(", ")}` });
    }
    values.push(b.recebido_tipo || null);
    sets.push(`recebido_tipo = $${values.length}`);
  }

  if (b.itens_verificados !== undefined) {
    if (typeof b.itens_verificados !== "object" || Array.isArray(b.itens_verificados)) {
      return res.status(400).json({ error: "itens_verificados deve ser objeto" });
    }
    values.push(JSON.stringify(b.itens_verificados));
    sets.push(`itens_verificados = $${values.length}::jsonb`);
  }
  if (b.correntes !== undefined) {
    if (b.correntes !== null && (typeof b.correntes !== "object" || Array.isArray(b.correntes))) {
      return res.status(400).json({ error: "correntes deve ser objeto ou null" });
    }
    values.push(b.correntes ? JSON.stringify(b.correntes) : null);
    sets.push(`correntes = $${values.length}::jsonb`);
  }

  if (b.observacoes !== undefined) {
    values.push(b.observacoes || null);
    sets.push(`observacoes = $${values.length}`);
  }

  if (b.servico_realizado !== undefined) {
    if (b.servico_realizado && !SERVICO_RESULTADOS.includes(b.servico_realizado)) {
      return res.status(400).json({ error: `servico_realizado deve ser: ${SERVICO_RESULTADOS.join(", ")}` });
    }
    values.push(b.servico_realizado || null);
    sets.push(`servico_realizado = $${values.length}`);
  }

  if (b.necessario_retorno !== undefined) {
    values.push(!!b.necessario_retorno);
    sets.push(`necessario_retorno = $${values.length}`);
  }
  if (b.retorno_sugerido_em !== undefined) {
    values.push(b.retorno_sugerido_em || null);
    sets.push(`retorno_sugerido_em = $${values.length}`);
  }
  if (b.assinatura_b64 !== undefined) {
    values.push(b.assinatura_b64 || null);
    sets.push(`assinatura_b64 = $${values.length}`);
  }

  if (sets.length === 0) return res.status(400).json({ error: "Nenhum campo para atualizar" });

  values.push(id);

  try {
    const result = await pool.query(
      `UPDATE ordens_servico SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "O.S. não encontrada" });
    return res.json(result.rows[0]);
  } catch (err) {
    console.error("[ordens-servico] PATCH /:id:", err);
    return res.status(500).json({ error: "Erro ao atualizar O.S." });
  }
});

// POST /ordens-servico/:id/fotos — registra metadado de uma foto já uploadada
router.post("/:id/fotos", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  const { url, legenda, tipo } = req.body || {};
  if (!url) return res.status(400).json({ error: "url é obrigatório" });
  if (tipo && !FOTO_TIPOS.includes(tipo)) {
    return res.status(400).json({ error: `tipo deve ser: ${FOTO_TIPOS.join(", ")}` });
  }

  try {
    const result = await pool.query(
      `INSERT INTO os_fotos (os_id, url, legenda, tipo)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, url, legenda || null, tipo || "geral"]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("[ordens-servico] POST /:id/fotos:", err);
    return res.status(500).json({ error: "Erro ao registrar foto" });
  }
});

// DELETE /ordens-servico/:id/fotos/:foto_id
router.delete("/:id/fotos/:foto_id", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const fotoId = Number(req.params.foto_id);
  if (!Number.isInteger(id) || !Number.isInteger(fotoId)) {
    return res.status(400).json({ error: "id inválido" });
  }
  try {
    await pool.query(`DELETE FROM os_fotos WHERE id = $1 AND os_id = $2`, [fotoId, id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[ordens-servico] DELETE foto:", err);
    return res.status(500).json({ error: "Erro ao excluir foto" });
  }
});

// POST /ordens-servico/:id/pecas — adiciona peça usada/substituída
router.post("/:id/pecas", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  const { descricao, quantidade, observacao } = req.body || {};
  if (!descricao) return res.status(400).json({ error: "descricao é obrigatório" });
  const qtd = quantidade != null ? Number(quantidade) : 1;
  if (!Number.isInteger(qtd) || qtd <= 0) {
    return res.status(400).json({ error: "quantidade inválida" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO os_pecas (os_id, descricao, quantidade, observacao)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, descricao, qtd, observacao || null]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("[ordens-servico] POST /:id/pecas:", err);
    return res.status(500).json({ error: "Erro ao adicionar peça" });
  }
});

// DELETE /ordens-servico/:id/pecas/:peca_id
router.delete("/:id/pecas/:peca_id", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const pecaId = Number(req.params.peca_id);
  if (!Number.isInteger(id) || !Number.isInteger(pecaId)) {
    return res.status(400).json({ error: "id inválido" });
  }
  try {
    await pool.query(`DELETE FROM os_pecas WHERE id = $1 AND os_id = $2`, [pecaId, id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[ordens-servico] DELETE peca:", err);
    return res.status(500).json({ error: "Erro ao excluir peça" });
  }
});

// POST /ordens-servico/:id/finalizar — valida obrigatórios, finaliza, fecha o chamado
router.post("/:id/finalizar", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const osRes = await client.query(
      `SELECT * FROM ordens_servico WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (osRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "O.S. não encontrada" });
    }
    const os = osRes.rows[0];

    if (os.finalizada_em) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "O.S. já finalizada" });
    }

    if (!os.tipos_servico || os.tipos_servico.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Pelo menos 1 tipo de serviço é obrigatório" });
    }
    if (!os.servico_realizado) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Resultado do serviço é obrigatório (resolvido / paliativo / agravado)" });
    }
    if (!os.assinatura_b64 || !os.recebido_nome) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Assinatura e nome de quem recebeu são obrigatórios" });
    }

    const upd = await client.query(
      `UPDATE ordens_servico SET finalizada_em = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );

    if (os.chamado_id) {
      await client.query(
        `UPDATE chamados
           SET ordem_servico_id = $1,
               status = 'fechado',
               fechado_em = NOW(),
               atualizado_em = NOW()
         WHERE id = $2`,
        [id, os.chamado_id]
      );
    }

    await client.query("COMMIT");
    return res.json(upd.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[ordens-servico] POST /:id/finalizar:", err);
    return res.status(500).json({ error: "Erro ao finalizar O.S." });
  } finally {
    client.release();
  }
});

module.exports = { ordensServicoRouter: router };
