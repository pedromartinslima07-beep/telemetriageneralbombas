const express = require("express");
const bcrypt = require("bcrypt");

const { pool } = require("../db");
const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");
const { masterAdminOnly } = require("../middleware/masterAdminOnly");

const router = express.Router();

function _normCoord(v, min, max) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return undefined; // inválido
  return n;
}

// Normaliza CEP: descarta tudo que não é dígito; exige exatamente 8 dígitos.
// Retorna null pra vazio, undefined pra inválido.
function _normCep(v) {
  if (v === undefined || v === null || v === "") return null;
  const d = String(v).replace(/\D/g, "");
  if (d.length === 0) return null;
  if (d.length !== 8) return undefined;
  return d;
}

// Normaliza lista de e-mails separados por vírgula (para envio de orçamentos).
// Retorna null pra vazio, undefined se algum e-mail for inválido, ou a lista
// limpa rejuntada por ", ".
const _EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function _normEmails(v) {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const lista = String(v)
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  if (!lista.length) return null;
  if (lista.some(e => !_EMAIL_RE.test(e))) return undefined; // inválido
  return lista.join(", ");
}

// POST /condominios (criar)
router.post("/", authRequired, masterAdminOnly, async (req, res) => {
  const {
    nome, nome_fantasia, cnpj, email, endereco, bairro, cidade, uf, cep,
    responsavel, telefone, observacoes, ativo,
    lat, lng, zona,
  } = req.body || {};

  const cnpjNorm = cnpj ? String(cnpj).replace(/\D/g, "").slice(0, 14) || null : null;

  const nomeNorm = nome ? String(nome).trim() : "";
  if (!nomeNorm) {
    return res.status(400).json({ error: "Campo obrigatório: nome" });
  }

  const ufNorm = uf ? String(uf).trim().toUpperCase().slice(0, 2) : null;
  const ativoNorm = (ativo === undefined || ativo === null) ? true : !!ativo;

  const latNorm = _normCoord(lat, -90, 90);
  const lngNorm = _normCoord(lng, -180, 180);
  if (latNorm === undefined) return res.status(400).json({ error: "lat inválida (-90 a 90)" });
  if (lngNorm === undefined) return res.status(400).json({ error: "lng inválida (-180 a 180)" });

  const cepNorm = _normCep(cep);
  if (cepNorm === undefined) return res.status(400).json({ error: "CEP inválido (precisa ter 8 dígitos)" });

  const emailNorm = _normEmails(email);
  if (emailNorm === undefined) return res.status(400).json({ error: "E-mail inválido (separe vários por vírgula)" });

  try {
    const result = await pool.query(
      `INSERT INTO condominios
        (nome, nome_fantasia, cnpj, email, endereco, bairro, cidade, uf, cep, responsavel, telefone, observacoes, ativo, lat, lng, zona)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING
        id, nome, nome_fantasia, cnpj, email, endereco, bairro, cidade, uf, cep,
        responsavel, telefone, observacoes, ativo, lat, lng, zona, criado_em`,
      [
        nomeNorm,
        nome_fantasia ? String(nome_fantasia).trim() || null : null,
        cnpjNorm,
        emailNorm,
        endereco ?? null,
        bairro ?? null,
        cidade ?? null,
        ufNorm,
        cepNorm,
        responsavel ?? null,
        telefone ?? null,
        observacoes ?? null,
        ativoNorm,
        latNorm,
        lngNorm,
        zona ? String(zona).trim() || null : null,
      ]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Erro ao criar condomínio:", error);
    return res.status(500).json({ error: "Erro ao criar condomínio" });
  }
});

// GET /condominios (listar)
router.get("/", authRequired, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.id, c.nome, c.nome_fantasia, c.cnpj, c.email, c.endereco, c.bairro, c.cidade, c.uf, c.cep,
        c.responsavel, c.telefone, c.observacoes, c.ativo, c.lat, c.lng, c.zona, c.criado_em,
        COUNT(r.id)::int AS total_reservatorios
      FROM condominios c
      LEFT JOIN reservatorios r ON r.condominio_id = c.id
      GROUP BY c.id
      ORDER BY c.id DESC
    `);

    return res.json(result.rows);
  } catch (error) {
    console.error("Erro ao listar condomínios:", error);
    return res.status(500).json({ error: "Erro ao listar condomínios" });
  }
});

// GET /condominios/:id (buscar 1)
router.get("/:id", authRequired, adminOnly, async (req, res) => {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }

  try {
    const result = await pool.query(`
      SELECT id, nome, nome_fantasia, cnpj, email, endereco, bairro, cidade, uf, cep,
             responsavel, telefone, observacoes, ativo, lat, lng, zona, criado_em
      FROM condominios
      WHERE id = $1
      LIMIT 1
    `, [idNum]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Condomínio não encontrado" });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error("Erro ao buscar condomínio:", error);
    return res.status(500).json({ error: "Erro ao buscar condomínio" });
  }
});

// PATCH /condominios/:id (editar)
router.patch("/:id", authRequired, masterAdminOnly, async (req, res) => {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }

  const b = req.body || {};

  const ufNorm =
    ("uf" in b)
      ? (b.uf ? String(b.uf).trim().toUpperCase().slice(0, 2) : null)
      : undefined;

  const ativoNorm =
    ("ativo" in b)
      ? (b.ativo === null ? null : !!b.ativo)
      : undefined;

  const sets = [];
  const values = [idNum];
  let i = 2;

  const add = (col, val) => {
    if (val === null) { sets.push(`${col} = NULL`); return; }
    if (val === undefined) return;
    sets.push(`${col} = $${i}`);
    values.push(val);
    i++;
  };

  add("nome", b.nome);
  add("nome_fantasia", "nome_fantasia" in b ? (b.nome_fantasia ? String(b.nome_fantasia).trim() || null : null) : undefined);
  add("cnpj", "cnpj" in b ? (b.cnpj ? String(b.cnpj).replace(/\D/g, "").slice(0, 14) || null : null) : undefined);
  if ("email" in b) {
    const emailNorm = _normEmails(b.email);
    if (emailNorm === undefined) return res.status(400).json({ error: "E-mail inválido (separe vários por vírgula)" });
    add("email", emailNorm);
  }
  add("endereco", b.endereco);
  add("bairro", b.bairro);
  add("cidade", b.cidade);
  add("uf", ufNorm);
  add("responsavel", b.responsavel);
  add("telefone", b.telefone);
  add("observacoes", b.observacoes);
  add("ativo", ativoNorm);

  if ("cep" in b) {
    const cepNorm = _normCep(b.cep);
    if (cepNorm === undefined) return res.status(400).json({ error: "CEP inválido (precisa ter 8 dígitos)" });
    add("cep", cepNorm);
  }
  if ("lat" in b) {
    const latNorm = _normCoord(b.lat, -90, 90);
    if (latNorm === undefined) return res.status(400).json({ error: "lat inválida (-90 a 90)" });
    add("lat", latNorm);
  }
  if ("lng" in b) {
    const lngNorm = _normCoord(b.lng, -180, 180);
    if (lngNorm === undefined) return res.status(400).json({ error: "lng inválida (-180 a 180)" });
    add("lng", lngNorm);
  }
  add("zona", "zona" in b ? (b.zona ? String(b.zona).trim() || null : null) : undefined);

  if (sets.length === 0) {
    return res.status(400).json({ error: "Nenhum campo para atualizar" });
  }

  try {
    const result = await pool.query(
      `UPDATE condominios SET ${sets.join(", ")} WHERE id = $1
       RETURNING id, nome, nome_fantasia, cnpj, email, endereco, bairro, cidade, uf, cep,
                 responsavel, telefone, observacoes, ativo, lat, lng, zona, criado_em`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Condomínio não encontrado" });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error("Erro ao atualizar condomínio:", error);
    if (error && error.code === "23505") {
      return res.status(409).json({ error: "Conflito: valor já cadastrado" });
    }
    return res.status(500).json({ error: "Erro ao atualizar condomínio" });
  }
});

// DELETE /condominios/:id  (soft delete + cascata nos reservatórios)
router.delete("/:id", authRequired, masterAdminOnly, async (req, res) => {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }

  try {
    const result = await pool.query(
      `UPDATE condominios SET ativo = false WHERE id = $1 RETURNING id`,
      [idNum]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Condomínio não encontrado" });
    }

    // desativa todos os reservatórios do condomínio
    await pool.query(
      `UPDATE reservatorios SET ativo = false WHERE condominio_id = $1`,
      [idNum]
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error("Erro ao excluir condomínio:", e);
    return res.status(500).json({ error: "Erro ao excluir condomínio" });
  }
});

// DELETE /condominios/:id/hard  (hard delete permanente — apenas master admin)
router.delete("/:id/hard", authRequired, masterAdminOnly, async (req, res) => {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }

  const { senha } = req.body || {};
  if (!senha) {
    return res.status(400).json({ error: "Campo obrigatório: senha" });
  }

  // verifica senha do admin logado
  const userRes = await pool.query(
    "SELECT senha_hash FROM usuarios WHERE id = $1 LIMIT 1",
    [req.user.id]
  );
  if (userRes.rows.length === 0) {
    return res.status(401).json({ error: "Usuário não encontrado" });
  }
  const senhaOk = await bcrypt.compare(String(senha), userRes.rows[0].senha_hash);
  if (!senhaOk) {
    return res.status(401).json({ error: "Senha incorreta" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verifica existência
    const existeRes = await client.query(
      "SELECT id FROM condominios WHERE id = $1 LIMIT 1", [idNum]
    );
    if (existeRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Condomínio não encontrado" });
    }

    // 1. IDs auxiliares necessários antes de deletar
    const chamadosRes = await client.query(
      "SELECT id FROM chamados WHERE condominio_id = $1", [idNum]
    );
    const chamadoIds = chamadosRes.rows.map((r) => r.id);

    const osRes = await client.query(
      `SELECT id FROM ordens_servico WHERE condominio_id = $1
       ${chamadoIds.length ? "OR chamado_id = ANY($2::int[])" : ""}`,
      chamadoIds.length ? [idNum, chamadoIds] : [idNum]
    );
    const osIds = osRes.rows.map((r) => r.id);

    const deviceRes = await client.query(
      "SELECT device_id FROM reservatorios WHERE condominio_id = $1", [idNum]
    );
    const deviceIds = deviceRes.rows.map((r) => r.device_id);

    // 2. alerta_comentarios (sem FK — vínculo lógico por alerta_origem + alerta_id)
    if (chamadoIds.length) {
      await client.query(
        "DELETE FROM alerta_comentarios WHERE alerta_origem = 'chamado' AND alerta_id = ANY($1::int[])",
        [chamadoIds]
      );
    }
    if (deviceIds.length) {
      await client.query(
        `DELETE FROM alerta_comentarios
         WHERE alerta_origem = 'telemetria'
           AND alerta_id IN (SELECT id FROM alertas WHERE device_id = ANY($1::varchar[]))`,
        [deviceIds]
      );
    }

    // 3. orcamentos + orcamento_linhas (CASCADE de orcamentos)
    await client.query(
      "DELETE FROM orcamentos WHERE condominio_id = $1", [idNum]
    );
    if (osIds.length) {
      await client.query(
        "DELETE FROM orcamentos WHERE os_id = ANY($1::int[])", [osIds]
      );
    }

    // 4. ordens_servico (CASCADE: os_fotos, os_pecas)
    if (osIds.length) {
      await client.query(
        "DELETE FROM ordens_servico WHERE id = ANY($1::int[])", [osIds]
      );
    }

    // 5. chamados (CASCADE: historico_chamados)
    await client.query(
      "DELETE FROM chamados WHERE condominio_id = $1", [idNum]
    );

    // 6. clientes_whatsapp (CASCADE: conversas_whatsapp → mensagens, qualidade)
    await client.query(
      "DELETE FROM clientes_whatsapp WHERE condominio_id = $1", [idNum]
    );

    // 7. telemetria
    if (deviceIds.length) {
      await client.query(
        "DELETE FROM leituras WHERE device_id = ANY($1::varchar[])", [deviceIds]
      );
      await client.query(
        "DELETE FROM alertas WHERE device_id = ANY($1::varchar[])", [deviceIds]
      );
    }

    // 8. condomínio — CASCADE: reservatorios, planos_manutencao, contratos
    //    SET NULL: usuarios.condominio_id (usuários não são deletados)
    await client.query("DELETE FROM condominios WHERE id = $1", [idNum]);

    await client.query("COMMIT");
    return res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Erro no hard delete:", e);
    return res.status(500).json({ error: "Erro ao excluir permanentemente" });
  } finally {
    client.release();
  }
});

module.exports = { condominiosRouter: router };