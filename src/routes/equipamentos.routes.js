// Equipamentos — identidade permanente de bomba/motor/painel + etiqueta QR.
//
// A dor de origem é da oficina: bomba na bancada sem ninguém saber de qual
// condomínio veio nem qual era o defeito. O QR resolve porque a etiqueta é
// permanente e a ficha guarda a linha do tempo — a mesma bomba volta várias
// vezes e é justamente o histórico que se perde hoje.
//
// Acesso: `equipeInterna` (admin, gerente, operador, técnico) na leitura e
// registro — quem escaneia na bancada é o técnico, que NÃO passa em adminOnly.
// `cliente` não entra em nenhuma rota daqui: a ficha revela endereço e
// histórico de um condomínio que pode não ser o dele.

const express = require("express");
const { pool } = require("../db");
const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");
const { gestaoOnly } = require("../middleware/gestaoOnly");
const { equipeInterna } = require("../middleware/equipeInterna");
const {
  gerarCodigo, normalizarCodigo, baseUrlValida, gerarPdfEtiquetas, FORMATOS,
} = require("../services/etiquetas-pdf.service");

const router = express.Router();

const TIPOS_EQUIPAMENTO = ["bomba", "motor", "painel", "quadro", "boia", "outro"];

// tipo da movimentação → status que o equipamento assume depois dela.
// `null` = não mexe no status (anotação é nota livre).
//
// `devolucao` leva a `instalado`, não a `devolvido`: o estado verdadeiro depois
// da entrega é "está no prédio funcionando", e é esse que a bancada precisa ver
// pra parar de contar a bomba como pendência. `devolvido` segue no CHECK da
// migration 070 como reservado, sem uso.
const STATUS_POR_TIPO = {
  cadastro:             "instalado",
  retirada:             "oficina",
  entrada_oficina:      "oficina",
  diagnostico:          null,               // Fase B
  orcamento_solicitado: "aguardando_orcamento",
  orcamento_aprovado:   "em_conserto",
  em_conserto:          "em_conserto",
  aguardando_peca:      "aguardando_peca",
  pronto:               "pronto",
  devolucao:            "instalado",
  anotacao:             null,
  baixa:                "baixado",
};

const MAX_FOTO_BYTES = 2 * 1024 * 1024; // ~2 MB por foto já em base64

/** Origem pública do sistema. PUBLIC_BASE_URL manda; senão, deriva do request. */
function baseUrlDe(req) {
  const env = process.env.PUBLIC_BASE_URL;
  if (env) return String(env).replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

// ===========================================================================
// Lote de etiquetas
// ===========================================================================

// POST /equipamentos/lote — cria N etiquetas EM BRANCO.
//
// A bomba chega na oficina antes de existir cadastro. Se o cadastro tivesse
// que vir primeiro, ninguém usaria: por isso a etiqueta nasce sem dono e é
// vinculada no ato da retirada, com a bomba na mão.
router.post("/lote", authRequired, gestaoOnly, async (req, res) => {
  const quantidade = Number(req.body?.quantidade);
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 200) {
    return res.status(400).json({ error: "quantidade deve ser um inteiro de 1 a 200" });
  }

  // Rótulo do lote no formato L{AAMM}{sequência da letra} — serve pra
  // reimprimir a folha inteira depois ("perdi a folha do lote L2608A").
  const agora = new Date();
  const prefixo = `L${String(agora.getFullYear()).slice(2)}${String(agora.getMonth() + 1).padStart(2, "0")}`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const r = await client.query(
      `SELECT COUNT(DISTINCT lote) AS n FROM equipamentos WHERE lote LIKE $1`,
      [`${prefixo}%`]
    );
    const lote = `${prefixo}${String.fromCharCode(65 + (Number(r.rows[0].n) % 26))}`;

    const criados = [];
    for (let i = 0; i < quantidade; i++) {
      // Colisão de código é praticamente impossível (32^8), mas o UNIQUE é a
      // autoridade. `ON CONFLICT DO NOTHING` deixa o retry ser local: sorteia
      // outro código sem abortar a transação — um 23505 dentro de BEGIN
      // invalidaria o lote inteiro já inserido.
      let inserido = null;
      for (let tentativa = 0; tentativa < 5 && !inserido; tentativa++) {
        const ins = await client.query(
          `INSERT INTO equipamentos (codigo, lote, status, criado_por)
           VALUES ($1, $2, 'etiqueta_livre', $3)
           ON CONFLICT (codigo) DO NOTHING
           RETURNING id, codigo, lote, status, criado_em`,
          [gerarCodigo(), lote, req.user.id]
        );
        inserido = ins.rows[0] || null;
      }
      if (!inserido) throw new Error("não foi possível gerar código único após 5 tentativas");
      criados.push(inserido);
    }

    await client.query("COMMIT");
    return res.status(201).json({ lote, quantidade: criados.length, equipamentos: criados });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[equipamentos] POST /lote:", err);
    return res.status(500).json({ error: "Erro ao gerar lote de etiquetas" });
  } finally {
    client.release();
  }
});

// GET /equipamentos/etiquetas.pdf?lote=L2608A | ?ids=1,2,3 | &formato=corte
//
// Declarada antes de `/:id` de propósito — o Express casa na ordem.
router.get("/etiquetas.pdf", authRequired, adminOnly, async (req, res) => {
  const { lote, ids, formato } = req.query;

  const base = baseUrlDe(req);
  if (!baseUrlValida(base) && req.query.forcar !== "1") {
    // Etiqueta é física e permanente: um QR apontando pra localhost vira lixo
    // colado numa bomba que ninguém vai reetiquetar. Falha aqui é barata.
    return res.status(400).json({
      error: `A URL pública ficou como "${base}". Etiqueta impressa com esse ` +
             `endereço não vai abrir em lugar nenhum. Defina PUBLIC_BASE_URL ` +
             `no ambiente (ou repita com &forcar=1 se for só um teste).`,
    });
  }

  try {
    let rows;
    if (ids) {
      const lista = String(ids).split(",").map(Number).filter(Number.isInteger);
      if (!lista.length) return res.status(400).json({ error: "ids inválidos" });
      const r = await pool.query(
        `SELECT id, codigo FROM equipamentos WHERE id = ANY($1::int[]) ORDER BY id`,
        [lista]
      );
      rows = r.rows;
    } else if (lote) {
      const r = await pool.query(
        `SELECT id, codigo FROM equipamentos WHERE lote = $1 ORDER BY id`,
        [String(lote)]
      );
      rows = r.rows;
    } else {
      return res.status(400).json({ error: "informe ?lote= ou ?ids=" });
    }

    if (!rows.length) return res.status(404).json({ error: "Nenhuma etiqueta encontrada" });

    const fmt = FORMATOS[formato] ? formato : "corte";
    const pdf = await gerarPdfEtiquetas(rows, base, fmt);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition",
      `inline; filename="etiquetas-${lote || "selecao"}.pdf"`);
    res.setHeader("Cache-Control", "no-store");
    return res.send(pdf);
  } catch (err) {
    console.error("[equipamentos] GET /etiquetas.pdf:", err);
    return res.status(500).json({ error: "Erro ao gerar as etiquetas" });
  }
});

// ===========================================================================
// Listagem e ficha
// ===========================================================================

// GET /equipamentos?status=&condominio_id=&lote=&q=&limit=
router.get("/", authRequired, equipeInterna, async (req, res) => {
  const { status, condominio_id, lote, q } = req.query;
  const limit = Math.min(Number(req.query.limit) || 200, 500);

  const where = ["e.ativo = true"];
  const vals = [];
  if (status)        { vals.push(String(status));        where.push(`e.status = $${vals.length}`); }
  if (condominio_id) { vals.push(Number(condominio_id)); where.push(`e.condominio_id = $${vals.length}`); }
  if (lote)          { vals.push(String(lote));          where.push(`e.lote = $${vals.length}`); }
  if (q) {
    vals.push(`%${String(q).trim()}%`);
    where.push(`(e.codigo ILIKE $${vals.length} OR e.apelido ILIKE $${vals.length}
                 OR e.marca ILIKE $${vals.length} OR e.modelo ILIKE $${vals.length}
                 OR e.numero_serie ILIKE $${vals.length})`);
  }
  vals.push(limit);

  try {
    const r = await pool.query(
      `SELECT e.id, e.codigo, e.lote, e.tipo, e.apelido, e.marca, e.modelo,
              e.numero_serie, e.status, e.defeito_relatado, e.condominio_id,
              e.criado_em, e.vinculado_em, e.atualizado_em,
              COALESCE(c.nome_fantasia, c.nome) AS condominio_nome,
              (SELECT MAX(m.criado_em) FROM equipamento_movimentacoes m
                WHERE m.equipamento_id = e.id) AS ultima_movimentacao_em
         FROM equipamentos e
         LEFT JOIN condominios c ON c.id = e.condominio_id
        WHERE ${where.join(" AND ")}
        ORDER BY e.atualizado_em DESC
        LIMIT $${vals.length}`,
      vals
    );
    return res.json(r.rows);
  } catch (err) {
    console.error("[equipamentos] GET /:", err);
    return res.status(500).json({ error: "Erro ao listar equipamentos" });
  }
});

// GET /equipamentos/condominios — lista mínima pro seletor da ficha.
//
// `GET /condominios` é adminOnly e o técnico não passa nele — mas é justamente
// o técnico que aponta de qual prédio a bomba saiu. Aqui vão só id e nome:
// nada de endereço, contato ou CNPJ, que é o que o guard de lá protege.
router.get("/condominios", authRequired, equipeInterna, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, COALESCE(nome_fantasia, nome) AS nome
         FROM condominios WHERE ativo = true
        ORDER BY 2 ASC`
    );
    return res.json(r.rows);
  } catch (err) {
    console.error("[equipamentos] GET /condominios:", err);
    return res.status(500).json({ error: "Erro ao listar condomínios" });
  }
});

/** Ficha completa: equipamento + condomínio + linha do tempo + fotos (sem base64). */
async function carregarFicha(where, val) {
  const eq = await pool.query(
    `SELECT e.*,
            COALESCE(c.nome_fantasia, c.nome) AS condominio_nome,
            c.endereco AS condominio_endereco, c.bairro AS condominio_bairro,
            c.cidade AS condominio_cidade, c.uf AS condominio_uf,
            c.responsavel AS condominio_responsavel, c.telefone AS condominio_telefone
       FROM equipamentos e
       LEFT JOIN condominios c ON c.id = e.condominio_id
      WHERE ${where}`,
    [val]
  );
  if (!eq.rows.length) return null;
  const equipamento = eq.rows[0];

  const [movs, fotos, orcamentos, ordens] = await Promise.all([
    pool.query(
      `SELECT m.id, m.tipo, m.status_novo, m.observacao, m.criado_em,
              m.chamado_id, m.os_id, m.orcamento_id,
              COALESCE(m.usuario_nome, u.nome) AS autor,
              ch.titulo AS chamado_titulo, os.numero AS os_numero
         FROM equipamento_movimentacoes m
         LEFT JOIN usuarios u        ON u.id  = m.usuario_id
         LEFT JOIN chamados ch       ON ch.id = m.chamado_id
         LEFT JOIN ordens_servico os ON os.id = m.os_id
        WHERE m.equipamento_id = $1
        ORDER BY m.criado_em DESC, m.id DESC`,
      [equipamento.id]
    ),
    // `dados_base64` fora do SELECT de propósito: a ficha lista dezenas de
    // fotos e cada uma tem centenas de KB. O binário vem por /imagem.
    pool.query(
      `SELECT id, legenda, movimentacao_id, criado_em
         FROM equipamento_fotos
        WHERE equipamento_id = $1
        ORDER BY criado_em DESC`,
      [equipamento.id]
    ),
    // Orçamentos desta bomba. O total respeita o override manual
    // (`orcamentos.valor`, migration 062) — mesma regra das outras listagens.
    pool.query(
      `SELECT o.id, o.numero, o.status, o.origem, o.criado_em, o.valido_ate,
              COALESCE(o.valor, SUM(l.quantidade * l.valor_unitario), 0) AS valor_total,
              COUNT(l.id) AS itens
         FROM orcamentos o
         LEFT JOIN orcamento_linhas l ON l.orcamento_id = o.id
        WHERE o.equipamento_id = $1
        GROUP BY o.id
        ORDER BY o.criado_em DESC`,
      [equipamento.id]
    ),
    // O.S. desta bomba — tanto as vinculadas diretamente (migration 072)
    // quanto as que aparecem nas movimentações, para não perder o que foi
    // registrado antes da coluna existir.
    pool.query(
      `SELECT DISTINCT os.id, os.numero, os.criado_em, os.finalizada_em,
              os.tipos_servico, t.nome AS tecnico_nome
         FROM ordens_servico os
         LEFT JOIN tecnicos t ON t.id = os.tecnico_id
        WHERE os.equipamento_id = $1
           OR os.id IN (SELECT m.os_id FROM equipamento_movimentacoes m
                         WHERE m.equipamento_id = $1 AND m.os_id IS NOT NULL)
        ORDER BY os.criado_em DESC`,
      [equipamento.id]
    ),
  ]);

  // Quantas vezes essa bomba já passou pela oficina — é o número que justifica
  // trocar o equipamento em vez de consertar de novo.
  const idas = movs.rows.filter((m) => m.tipo === "retirada").length;

  return {
    equipamento,
    movimentacoes: movs.rows,
    fotos: fotos.rows,
    orcamentos: orcamentos.rows,
    ordens_servico: ordens.rows,
    idas_oficina: idas,
  };
}

// GET /equipamentos/codigo/:codigo — é o que a etiqueta abre.
router.get("/codigo/:codigo", authRequired, equipeInterna, async (req, res) => {
  const codigo = normalizarCodigo(req.params.codigo);
  if (!codigo) return res.status(400).json({ error: "código inválido" });
  try {
    const ficha = await carregarFicha("e.codigo = $1", codigo);
    if (!ficha) return res.status(404).json({ error: "Etiqueta não encontrada" });
    return res.json(ficha);
  } catch (err) {
    console.error("[equipamentos] GET /codigo/:codigo:", err);
    return res.status(500).json({ error: "Erro ao carregar a ficha" });
  }
});

// GET /equipamentos/:id
router.get("/:id", authRequired, equipeInterna, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });
  try {
    const ficha = await carregarFicha("e.id = $1", id);
    if (!ficha) return res.status(404).json({ error: "Equipamento não encontrado" });
    return res.json(ficha);
  } catch (err) {
    console.error("[equipamentos] GET /:id:", err);
    return res.status(500).json({ error: "Erro ao carregar a ficha" });
  }
});

// ===========================================================================
// Vínculo e edição
// ===========================================================================

const CAMPOS_EDITAVEIS = [
  "tipo", "apelido", "marca", "modelo", "numero_serie", "potencia_cv",
  "tensao", "local_instalacao", "defeito_relatado", "observacoes",
  "instalado_em", "garantia_ate",
];

// POST /equipamentos/:id/vincular — o ato que o técnico faz com a bomba na mão.
//
// Uma chamada só: preenche os dados, aponta o condomínio e já registra a
// primeira movimentação. `destino` decide se a bomba está saindo do prédio
// (`oficina`) ou só sendo cadastrada onde está (`instalado`).
router.post("/:id/vincular", authRequired, equipeInterna, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  const { condominio_id, destino, chamado_id, os_id, observacao } = req.body || {};
  if (!Number.isInteger(Number(condominio_id))) {
    return res.status(400).json({ error: "condominio_id é obrigatório" });
  }
  const dest = destino === "oficina" ? "oficina" : "instalado";
  if (req.body?.tipo && !TIPOS_EQUIPAMENTO.includes(req.body.tipo)) {
    return res.status(400).json({ error: "tipo inválido" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const atual = await client.query(
      `SELECT id, status, vinculado_em FROM equipamentos WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (!atual.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Equipamento não encontrado" });
    }

    const sets = ["condominio_id = $1", "status = $2", "atualizado_em = NOW()"];
    const vals = [Number(condominio_id), dest];
    // `vinculado_em` marca a primeira vez — reetiquetar não reescreve a data.
    if (!atual.rows[0].vinculado_em) sets.push("vinculado_em = NOW()");
    for (const campo of CAMPOS_EDITAVEIS) {
      if (req.body[campo] !== undefined) {
        vals.push(req.body[campo] === "" ? null : req.body[campo]);
        sets.push(`${campo} = $${vals.length}`);
      }
    }
    vals.push(id);

    const upd = await client.query(
      `UPDATE equipamentos SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING *`,
      vals
    );

    const tipoMov = dest === "oficina" ? "retirada" : "cadastro";
    await client.query(
      `INSERT INTO equipamento_movimentacoes
         (equipamento_id, tipo, status_novo, chamado_id, os_id, condominio_id,
          usuario_id, usuario_nome, observacao)
       VALUES ($1, $2, $3, $4, $5, $6, $7,
               (SELECT nome FROM usuarios WHERE id = $7), $8)`,
      [id, tipoMov, dest, chamado_id || null, os_id || null, Number(condominio_id),
       req.user.id, observacao || null]
    );

    await client.query("COMMIT");
    return res.json(upd.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23503") {
      return res.status(400).json({ error: "Condomínio, chamado ou O.S. inexistente" });
    }
    console.error("[equipamentos] POST /:id/vincular:", err);
    return res.status(500).json({ error: "Erro ao vincular o equipamento" });
  } finally {
    client.release();
  }
});

// PATCH /equipamentos/:id — corrige dados cadastrais. Não mexe em status:
// status muda por movimentação, pra nunca existir mudança sem rastro.
router.patch("/:id", authRequired, equipeInterna, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });
  if (req.body?.tipo && !TIPOS_EQUIPAMENTO.includes(req.body.tipo)) {
    return res.status(400).json({ error: "tipo inválido" });
  }

  const sets = ["atualizado_em = NOW()"];
  const vals = [];
  for (const campo of CAMPOS_EDITAVEIS) {
    if (req.body?.[campo] !== undefined) {
      vals.push(req.body[campo] === "" ? null : req.body[campo]);
      sets.push(`${campo} = $${vals.length}`);
    }
  }
  if (req.body?.condominio_id !== undefined) {
    vals.push(req.body.condominio_id || null);
    sets.push(`condominio_id = $${vals.length}`);
  }
  if (vals.length === 0) return res.status(400).json({ error: "nada para atualizar" });
  vals.push(id);

  try {
    const r = await pool.query(
      `UPDATE equipamentos SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (!r.rows.length) return res.status(404).json({ error: "Equipamento não encontrado" });
    return res.json(r.rows[0]);
  } catch (err) {
    console.error("[equipamentos] PATCH /:id:", err);
    return res.status(500).json({ error: "Erro ao atualizar o equipamento" });
  }
});

// ===========================================================================
// Movimentações
// ===========================================================================

// POST /equipamentos/:id/movimentacoes
router.post("/:id/movimentacoes", authRequired, equipeInterna, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  const { tipo, observacao, chamado_id, os_id, orcamento_id } = req.body || {};
  if (!Object.prototype.hasOwnProperty.call(STATUS_POR_TIPO, tipo)) {
    return res.status(400).json({ error: "tipo de movimentação inválido" });
  }
  if (tipo === "anotacao" && !String(observacao || "").trim()) {
    return res.status(400).json({ error: "anotação sem texto" });
  }

  const statusNovo = STATUS_POR_TIPO[tipo];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const eq = await client.query(
      `SELECT id, condominio_id FROM equipamentos WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (!eq.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Equipamento não encontrado" });
    }

    const mov = await client.query(
      `INSERT INTO equipamento_movimentacoes
         (equipamento_id, tipo, status_novo, chamado_id, os_id, orcamento_id,
          condominio_id, usuario_id, usuario_nome, observacao)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
               (SELECT nome FROM usuarios WHERE id = $8), $9)
       RETURNING *`,
      [id, tipo, statusNovo, chamado_id || null, os_id || null, orcamento_id || null,
       eq.rows[0].condominio_id, req.user.id, observacao || null]
    );

    if (statusNovo) {
      await client.query(
        `UPDATE equipamentos SET status = $1, atualizado_em = NOW() WHERE id = $2`,
        [statusNovo, id]
      );
    } else {
      await client.query(`UPDATE equipamentos SET atualizado_em = NOW() WHERE id = $1`, [id]);
    }

    await client.query("COMMIT");
    return res.status(201).json(mov.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23503") {
      return res.status(400).json({ error: "Chamado, O.S. ou orçamento inexistente" });
    }
    console.error("[equipamentos] POST /:id/movimentacoes:", err);
    return res.status(500).json({ error: "Erro ao registrar a movimentação" });
  } finally {
    client.release();
  }
});

// ===========================================================================
// Orçamento da bancada (Fase 12B)
// ===========================================================================

// POST /equipamentos/:id/orcamento — "essa bomba precisa de peça, quanto custa?"
//
// Cria um `orcamentos` comum com `origem = 'bancada'`, as peças como
// `orcamento_linhas`, e amarra os dois lados: o orçamento aponta a bomba
// (`equipamento_id`) e a movimentação aponta o orçamento. Tudo numa transação —
// meio caminho aqui deixaria a bomba "aguardando orçamento" sem orçamento.
//
// Nenhuma tabela de peças própria: a linha do orçamento JÁ é o item, e o PDF,
// o envio por e-mail e a aprovação vêm de graça do sistema que existe.
router.post("/:id/orcamento", authRequired, equipeInterna, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  const { constatacao, itens } = req.body || {};
  const lista = Array.isArray(itens) ? itens.filter(i => String(i?.descricao || "").trim()) : [];
  if (!lista.length) {
    return res.status(400).json({ error: "informe ao menos uma peça ou serviço" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const eq = await client.query(
      `SELECT e.id, e.condominio_id, e.apelido, e.tipo, e.marca, e.modelo,
              e.numero_serie, e.defeito_relatado, e.status
         FROM equipamentos e WHERE e.id = $1 FOR UPDATE`,
      [id]
    );
    if (!eq.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Equipamento não encontrado" });
    }
    const equip = eq.rows[0];

    const numero = (await client.query(
      "SELECT 'OR-' || LPAD(nextval('orcamento_numero_seq')::text, 6, '0') AS n"
    )).rows[0].n;

    // A constatação já nasce dizendo de qual equipamento se trata — quem lê o
    // PDF do outro lado não tem a etiqueta na mão.
    const identificacao = [
      equip.apelido || equip.tipo || "Equipamento",
      [equip.marca, equip.modelo].filter(Boolean).join(" "),
      equip.numero_serie ? `série ${equip.numero_serie}` : null,
    ].filter(Boolean).join(" · ");
    const constatacaoFinal = String(
      constatacao || equip.defeito_relatado || ""
    ).trim();

    const orc = await client.query(
      `INSERT INTO orcamentos
         (numero, condominio_id, equipamento_id, origem, tipo, status, constatacao, criado_por)
       VALUES ($1, $2, $3, 'bancada', 'pecas', 'rascunho', $4, $5)
       RETURNING id, numero, status`,
      [numero, equip.condominio_id, id,
       `${identificacao}${constatacaoFinal ? `. ${constatacaoFinal}` : ""}`.slice(0, 1000),
       req.user.id]
    );
    const orcamentoId = orc.rows[0].id;

    for (const item of lista) {
      await client.query(
        `INSERT INTO orcamento_linhas (orcamento_id, descricao, quantidade, valor_unitario, ficha_tecnica)
         VALUES ($1, $2, $3, $4, $5)`,
        [orcamentoId,
         String(item.descricao).trim().slice(0, 255),
         Number(item.quantidade) > 0 ? Number(item.quantidade) : 1,
         // Sem preço lançado fica NULL de verdade (migration 062): quem está na
         // bancada sabe a peça, não o preço — quem precifica é o comercial.
         item.valor_unitario === "" || item.valor_unitario == null
           ? null : Number(item.valor_unitario),
         item.ficha_tecnica ? String(item.ficha_tecnica).slice(0, 1000) : null]
      );
    }

    await client.query(
      `INSERT INTO equipamento_movimentacoes
         (equipamento_id, tipo, status_novo, orcamento_id, condominio_id,
          usuario_id, usuario_nome, observacao)
       VALUES ($1, 'orcamento_solicitado', 'aguardando_orcamento', $2, $3, $4,
               (SELECT nome FROM usuarios WHERE id = $4), $5)`,
      [id, orcamentoId, equip.condominio_id, req.user.id,
       `${lista.length} ${lista.length === 1 ? "item" : "itens"} · ${numero}`]
    );

    await client.query(
      `UPDATE equipamentos SET status = 'aguardando_orcamento', atualizado_em = NOW() WHERE id = $1`,
      [id]
    );

    await client.query("COMMIT");
    return res.status(201).json({ ...orc.rows[0], itens: lista.length });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[equipamentos] POST /:id/orcamento:", err);
    return res.status(500).json({ error: "Erro ao solicitar o orçamento" });
  } finally {
    client.release();
  }
});

// ===========================================================================
// Fotos (base64 no banco — disco do Railway é efêmero, ver migration 053)
// ===========================================================================

// POST /equipamentos/:id/fotos
router.post("/:id/fotos", authRequired, equipeInterna, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  const { dados_base64, legenda, movimentacao_id } = req.body || {};
  if (!dados_base64 || !/^data:image\/(jpeg|jpg|png|webp);base64,/.test(dados_base64)) {
    return res.status(400).json({ error: "envie uma imagem em data URL (data:image/...;base64,)" });
  }
  if (dados_base64.length > MAX_FOTO_BYTES) {
    return res.status(413).json({
      error: "Imagem muito grande — comprima no navegador antes de enviar (máx. ~2 MB).",
    });
  }

  try {
    const r = await pool.query(
      `INSERT INTO equipamento_fotos
         (equipamento_id, movimentacao_id, dados_base64, legenda, criado_por)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, legenda, movimentacao_id, criado_em`,
      [id, movimentacao_id || null, dados_base64, legenda || null, req.user.id]
    );
    await pool.query(`UPDATE equipamentos SET atualizado_em = NOW() WHERE id = $1`, [id]);
    return res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === "23503") return res.status(404).json({ error: "Equipamento não encontrado" });
    console.error("[equipamentos] POST /:id/fotos:", err);
    return res.status(500).json({ error: "Erro ao salvar a foto" });
  }
});

// GET /equipamentos/:id/fotos/:fotoId/imagem — serve o binário.
router.get("/:id/fotos/:fotoId/imagem", authRequired, equipeInterna, async (req, res) => {
  const id = Number(req.params.id);
  const fotoId = Number(req.params.fotoId);
  if (!Number.isInteger(id) || !Number.isInteger(fotoId)) {
    return res.status(400).json({ error: "id inválido" });
  }
  try {
    const r = await pool.query(
      `SELECT dados_base64 FROM equipamento_fotos WHERE id = $1 AND equipamento_id = $2`,
      [fotoId, id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Foto não encontrada" });

    const m = /^data:(image\/[a-z]+);base64,(.+)$/s.exec(r.rows[0].dados_base64 || "");
    if (!m) return res.status(500).json({ error: "Foto corrompida" });

    res.setHeader("Content-Type", m[1]);
    res.setHeader("Cache-Control", "private, max-age=86400");
    return res.send(Buffer.from(m[2], "base64"));
  } catch (err) {
    console.error("[equipamentos] GET foto:", err);
    return res.status(500).json({ error: "Erro ao carregar a foto" });
  }
});

// DELETE /equipamentos/:id/fotos/:fotoId
router.delete("/:id/fotos/:fotoId", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const fotoId = Number(req.params.fotoId);
  if (!Number.isInteger(id) || !Number.isInteger(fotoId)) {
    return res.status(400).json({ error: "id inválido" });
  }
  try {
    await pool.query(
      `DELETE FROM equipamento_fotos WHERE id = $1 AND equipamento_id = $2`,
      [fotoId, id]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("[equipamentos] DELETE foto:", err);
    return res.status(500).json({ error: "Erro ao excluir a foto" });
  }
});

// ===========================================================================
// Baixa
// ===========================================================================

// DELETE /equipamentos/:id — só apaga de verdade etiqueta nunca usada
// (impressa errado, folha perdida). Equipamento com histórico é INATIVADO:
// apagar levaria junto a linha do tempo, que é o ativo do módulo.
router.delete("/:id", authRequired, gestaoOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });
  try {
    const r = await pool.query(
      `SELECT e.status,
              (SELECT COUNT(*) FROM equipamento_movimentacoes m
                WHERE m.equipamento_id = e.id) AS movs
         FROM equipamentos e WHERE e.id = $1`,
      [id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Equipamento não encontrado" });

    const virgem = r.rows[0].status === "etiqueta_livre" && Number(r.rows[0].movs) === 0;
    if (virgem) {
      await pool.query(`DELETE FROM equipamentos WHERE id = $1`, [id]);
      return res.json({ ok: true, apagado: true });
    }

    await pool.query(
      `UPDATE equipamentos SET ativo = false, status = 'baixado', atualizado_em = NOW()
        WHERE id = $1`,
      [id]
    );
    await pool.query(
      `INSERT INTO equipamento_movimentacoes
         (equipamento_id, tipo, status_novo, usuario_id, usuario_nome, observacao)
       VALUES ($1, 'baixa', 'baixado', $2, (SELECT nome FROM usuarios WHERE id = $2), $3)`,
      [id, req.user.id, req.body?.observacao || null]
    );
    return res.json({ ok: true, apagado: false });
  } catch (err) {
    console.error("[equipamentos] DELETE /:id:", err);
    return res.status(500).json({ error: "Erro ao dar baixa no equipamento" });
  }
});

module.exports = { equipamentosRouter: router };
