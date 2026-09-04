const express = require("express");
const { pool } = require("../db");
const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");
const { GESTAO_ROLES } = require("../middleware/gestaoOnly");
const { salvarFotoMensagemChamado } = require("../services/chamado-mensagens.service");
const { registrarCriacao, registrarMudancas } = require("../services/chamado-historico.service");
const { resolverTecnico } = require("../services/chamado-atribuicao.service");

const router = express.Router();

// ⚠️ A LISTA MORA NO `prioridade.service.js` — ela estava repetida em quatro
// arquivos, e acrescentar uma categoria pedia lembrar dos quatro.
const {
  CATEGORIAS, CATEGORIA_ROTULO, CATEGORIA_PRIORIDADE, PRIORIDADES, ENQUADRAMENTO,
  prioridadeSugerida, subirUmNivel,
} = require("../services/prioridade.service");

// POST /chamados — cria chamado manualmente (admin, gerente, operador)
//
// ⚠️ `tecnico_id` É OPCIONAL E NASCEU DEPOIS (31/08/2026, pedido do Pedro:
// "quando fosse criar o chamado já desse para atribuir o técnico"). Antes o
// chamado nascia sempre sem ninguém e o operador tinha de achá-lo na fila para
// despachar — dois passos para uma decisão que, no telefone, já estava tomada.
//
// ⚠️ NÃO CONFUNDIR COM `responsavel_id`: aquele é o USUÁRIO interno que
// responde pelo chamado; este é o TÉCNICO de campo que vai ao prédio. São
// colunas diferentes e telas diferentes.
// GET /chamados/prioridades
//
// A régua do contrato, montada para a tela: as quatro prioridades com rótulo,
// enquadramento e PRAZO, mais o mapa categoria → prioridade.
//
// ⚠️ O PRAZO VEM DE `sla_definicoes`, NÃO DO HTML. Os botões P1–P4 do modal
// traziam "≤ 3h", "24-48h", "≤ 72h" escritos à mão — e o "24-48h" prometia uma
// janela que a cláusula 7 não dá (ela diz "até 48 horas"). Pior: editar o SLA
// em Configurações não mudava o que a tela dizia. Agora é uma fonte só.
//
// ⚠️ `adminOnly` e não `masterAdminOnly`: quem abre chamado precisa ler isto.
// A EDIÇÃO do SLA continua sendo do admin master, em `PATCH /admin/sla`.
//
// ⚠️ `sla_chegada_min` nulo é o P4 — "Agendamento" na minuta, não zero. A tela
// tem de dizer "conforme agenda", e para isso precisa distinguir nulo de 0.
router.get("/prioridades", authRequired, adminOnly, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT prioridade, ttfr_min, ttr_min, sla_chegada_min
         FROM sla_definicoes
        WHERE prioridade = ANY($1::varchar[])`,
      [PRIORIDADES]
    );
    const porId = Object.fromEntries(r.rows.map((x) => [x.prioridade, x]));
    return res.json({
      prioridades: PRIORIDADES.map((id) => ({
        id,
        rotulo: ENQUADRAMENTO[id].rotulo,
        enquadramento: ENQUADRAMENTO[id].enquadramento,
        plantao: ENQUADRAMENTO[id].plantao,
        sla_chegada_min: porId[id] ? porId[id].sla_chegada_min : null,
        ttfr_min: porId[id] ? porId[id].ttfr_min : null,
      })),
      categorias: CATEGORIAS.map((id) => ({
        id,
        rotulo: CATEGORIA_ROTULO[id],
        prioridade: CATEGORIA_PRIORIDADE[id] || "p3",
      })),
    });
  } catch (err) {
    console.error("[chamados] GET /prioridades:", err);
    return res.status(500).json({ error: "Erro ao buscar a régua de prioridade" });
  }
});

router.post("/", authRequired, adminOnly, async (req, res) => {
  const { titulo, descricao, categoria, prioridade, condominio_id, responsavel_id, tecnico_id,
          orcamento_id } = req.body || {};

  if (!titulo || typeof titulo !== "string" || !titulo.trim())
    return res.status(400).json({ error: "Título obrigatório" });
  if (!descricao || typeof descricao !== "string" || descricao.trim().length < 5)
    return res.status(400).json({ error: "Descreva o problema com pelo menos 5 caracteres" });
  if (categoria && !CATEGORIAS.includes(categoria))
    return res.status(400).json({ error: `categoria inválida` });
  if (prioridade && !PRIORIDADES.includes(prioridade))
    return res.status(400).json({ error: `prioridade inválida` });

  try {
    const tec = await resolverTecnico(tecnico_id);
    if (!tec.ok) return res.status(400).json({ error: tec.erro });

    // ⚠️ O CHAMADO QUE EXECUTA UM ORÇAMENTO (03/09/2026). A coluna
    // `chamados.orcamento_id` existe desde a migration 079, mas até aqui só a
    // rota do painel do OPERADOR a preenchia — o botão dentro da placa do
    // orçamento aprovado. Chamado aberto pelo admin, que é o caminho normal,
    // nascia sem vínculo nenhum: o técnico ia, fazia, fechava a O.S., e o
    // orçamento seguia em "Aprovados" dizendo "Pode executar" para sempre,
    // porque não havia uma linha no banco ligando o serviço ao documento.
    //
    // Relato do Pedro (03/09): *"um técnico foi ao condomínio fez o serviço,
    // tínhamos a O.S. no sistema porém estava lá em aprovados como se o
    // serviço ainda estivesse em aberto"*.
    let orcFinal = null;
    if (orcamento_id != null && orcamento_id !== "") {
      const oid = Number(orcamento_id);
      if (!Number.isInteger(oid) || oid <= 0) {
        return res.status(400).json({ error: "orcamento_id inválido" });
      }
      const orc = await pool.query(
        "SELECT id, status, condominio_id FROM orcamentos WHERE id = $1", [oid]
      );
      if (!orc.rows.length) return res.status(404).json({ error: "Orçamento não encontrado" });
      // Mesma porta, mesma tranca da rota do operador: um chamado que promete
      // executar um orçamento não aprovado é pior que um erro.
      if (orc.rows[0].status !== "aprovado") {
        return res.status(409).json({ error: "Este orçamento não está aprovado." });
      }
      // ⚠️ O PRÉDIO TEM DE SER O MESMO. Sem esta checagem, um clique errado no
      // modal amarra o serviço de um condomínio ao orçamento de outro — e o
      // erro não aparece em lugar nenhum até alguém cobrar a nota.
      const condoChamado = condominio_id ? Number(condominio_id) : null;
      if (orc.rows[0].condominio_id && orc.rows[0].condominio_id !== condoChamado) {
        return res.status(409).json({ error: "Este orçamento é de outro condomínio." });
      }
      orcFinal = oid;
    }

    // ⚠️ SEM PRIORIDADE NO CORPO, QUEM DECIDE É A CATEGORIA (03/09/2026) — e
    // não mais um "p3" fixo. A régua está no `prioridade.service.js`, ancorada
    // na cláusula 7 da minuta, e é a mesma que o painel do cliente usa desde
    // sempre. O painel do admin manda a prioridade explícita (a categoria
    // apenas MOVE o seletor lá, porque a cláusula 7.1.c prevê reclassificação
    // pela triagem); este default cobre quem não manda — integrações e o
    // corpo enxuto.
    const prioPedida = prioridade || prioridadeSugerida(categoria);
    let prioFinal = prioPedida;

    // Detecção de recorrência: mesma categoria no mesmo condomínio nos últimos
    // 30 dias → sobe 1 nível (P4→P3→P2→P1).
    //
    // ⚠️ ISSO ERA MUDO ATÉ 03/09/2026, e mudo é o pior jeito de uma regra
    // automática existir: o operador escolhia P2, o banco gravava P1 e a tela
    // não dizia nada — quem visse a fila depois concluiria que alguém tinha
    // errado a classificação. Agora a resposta carrega `prioridade_ajustada`,
    // e a tela conta o que aconteceu.
    let ajuste = null;
    if (categoria && condominio_id) {
      const recorrencia = await pool.query(
        `SELECT 1 FROM chamados
         WHERE condominio_id = $1 AND categoria = $2
           AND criado_em >= NOW() - INTERVAL '30 days'
           AND prioridade <> 'p4'
         LIMIT 1`,
        [Number(condominio_id), categoria]
      );
      if (recorrencia.rows.length > 0) {
        prioFinal = subirUmNivel(prioPedida);
        if (prioFinal !== prioPedida) {
          ajuste = {
            de: prioPedida,
            para: prioFinal,
            motivo: "recorrencia_30_dias",
            texto: "Já houve chamado desta categoria neste prédio nos últimos 30 dias — " +
                   "a prioridade subiu um nível.",
          };
        }
      }
    }

    // ⚠️ NASCER COM TÉCNICO MARCA O TTFR, e é a mesma regra do PATCH ("atribuir
    // técnico marca o TTFR, tirar o técnico não"). O relógio da primeira
    // resposta mede quanto a equipe demorou a responder; se o operador já
    // despachou no ato de abrir, a resposta foi imediata e o relógio nasce
    // parado. Deixá-lo correndo faria a fila cobrar uma resposta que já veio.
    //
    // ⚠️ `$7::int` NAS DUAS APARIÇÕES — o mesmo `$n` usado como valor de coluna
    // e dentro de uma comparação deduz tipos diferentes e o Postgres recusa a
    // query no parse (42P08). Ver CLAUDE.md.
    //
    // ⚠️ E O STATUS CONTINUA `aberto`. `em_atendimento` é do app do técnico
    // (`/iniciar-atendimento`, com GPS) — atribuir não é começar.
    const ins = await pool.query(
      `INSERT INTO chamados (condominio_id, titulo, descricao, prioridade, categoria, responsavel_id,
                             tecnico_id, primeira_resposta_em, status, orcamento_id)
       VALUES ($1, $2, $3, $4, $5, $6,
               $7::int, CASE WHEN $7::int IS NULL THEN NULL ELSE NOW() END, 'aberto', $8)
       RETURNING id, status, prioridade, categoria, titulo, descricao, condominio_id, responsavel_id,
                 tecnico_id, criado_em, orcamento_id`,
      [
        condominio_id ? Number(condominio_id) : null,
        titulo.trim().slice(0, 255),
        descricao.trim().slice(0, 4000),
        prioFinal,
        categoria || "outro",
        responsavel_id ? Number(responsavel_id) : null,
        tec.id,
        orcFinal,
      ]
    );
    const row = ins.rows[0];
    // Informa se houve bump de recorrência
    if (row.prioridade !== (prioridade || "p3")) {
      row._recorrencia_bump = true;
    }
    registrarCriacao({ chamadoId: row.id, alteradoPor: req.user.id });
    // A atribuição entra no histórico como qualquer outra, e de propósito: a
    // ficha responde "quem mandou o técnico e quando" da mesma forma, tenha
    // sido no nascimento ou no despacho depois. `antes` é o chamado que teria
    // existido sem a escolha — é o que torna a linha legível ("— → 3").
    if (row.tecnico_id) {
      registrarMudancas({
        chamadoId: row.id,
        antes: { tecnico_id: null },
        depois: { tecnico_id: row.tecnico_id },
        alteradoPor: req.user.id,
      });
    }
    // `prioridade_ajustada` só existe quando a recorrência mexeu — chave ausente
    // é o caso normal, e o front não precisa testar nada além da presença dela.
    return res.status(201).json(ajuste ? { ...row, prioridade_ajustada: ajuste } : row);
  } catch (e) {
    console.error("[chamados] POST /:", e);
    return res.status(500).json({ error: "Erro ao criar chamado" });
  }
});

// GET /chamados — lista chamados (com filtros opcionais)
router.get("/", authRequired, adminOnly, async (req, res) => {
  const { status, prioridade, categoria, condominio_id } = req.query;

  const conditions = [];
  const values = [];

  if (status) {
    values.push(status);
    conditions.push(`ch.status = $${values.length}`);
  }
  if (prioridade) {
    values.push(prioridade);
    conditions.push(`ch.prioridade = $${values.length}`);
  }
  if (categoria) {
    values.push(categoria);
    conditions.push(`ch.categoria = $${values.length}`);
  }
  if (condominio_id) {
    values.push(Number(condominio_id));
    conditions.push(`ch.condominio_id = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const result = await pool.query(
      `SELECT
         ch.id,
         ch.status,
         ch.prioridade,
         ch.categoria,
         ch.titulo,
         ch.descricao,
         ch.condominio_id,
         ch.tecnico_id,
         ch.criado_em,
         ch.atualizado_em,
         ch.fechado_em,
         ch.cancelado_em,
         ch.cancelado_motivo,
         ch.primeira_resposta_em,
         ch.tecnico_a_caminho_em,
         ch.tecnico_chegou_em,
         c.nome  AS condominio_nome,
         u.nome  AS responsavel_nome,
         t.nome  AS tecnico_nome,
         cw.telefone AS cliente_telefone,
         cw.nome     AS cliente_nome,
         os.id       AS ordem_servico_id,
         ch.avaliacao_nota,
         os.orcamento_necessario,
         os.orcamento_observacoes,
         os.finalizada_em       AS os_finalizada_em,
         ch.plano_manutencao_id,
         pm.titulo               AS plano_titulo,
         -- Fase 8B: SLA estourado em tempo real
         -- sla_ttfr_estourado: sem resposta + passou do ttfr_min da prioridade
         CASE WHEN ch.status IN ('aberto', 'em_atendimento')
                   AND ch.primeira_resposta_em IS NULL
                   AND sd.ttfr_min IS NOT NULL
                   AND ch.criado_em < NOW() - (sd.ttfr_min || ' minutes')::interval
              THEN true ELSE false END AS sla_ttfr_estourado,
         -- sla_ttr_risco: não fechado + passou do ttr_min (ainda que já respondido)
         CASE WHEN ch.status IN ('aberto', 'em_atendimento')
                   AND sd.ttr_min IS NOT NULL
                   AND ch.criado_em < NOW() - (sd.ttr_min || ' minutes')::interval
              THEN true ELSE false END AS sla_ttr_risco,
         sd.ttfr_min AS sla_ttfr_min,
         sd.ttr_min  AS sla_ttr_min
       FROM chamados ch
       LEFT JOIN condominios c  ON c.id  = ch.condominio_id
       LEFT JOIN usuarios u     ON u.id  = ch.responsavel_id
       LEFT JOIN tecnicos t     ON t.id  = ch.tecnico_id
       LEFT JOIN conversas_whatsapp cv ON cv.id = ch.conversa_id
       LEFT JOIN clientes_whatsapp cw  ON cw.id = cv.cliente_whatsapp_id
       LEFT JOIN ordens_servico os     ON os.chamado_id = ch.id
       LEFT JOIN planos_manutencao pm  ON pm.id = ch.plano_manutencao_id
       LEFT JOIN sla_definicoes sd     ON sd.prioridade = ch.prioridade
       ${where}
       ORDER BY ch.criado_em DESC
       LIMIT 200`,
      values
    );

    return res.json(result.rows);
  } catch (err) {
    console.error("[chamados] GET /chamados:", err);
    return res.status(500).json({ error: "Erro ao buscar chamados" });
  }
});

// GET /chamados/meus — chamados atribuídos ao técnico autenticado (app mobile)
// Resolve `tecnicos.id` via `tecnicos.usuario_id = req.user.id`.
// Filtros opcionais:
//   ?status=aberto,em_atendimento  (csv)
//   ?abertos=1  (atalho: status NOT IN ('fechado','cancelado'))
//   ?desde=ISO  (criado_em >= desde)
router.get("/meus", authRequired, async (req, res) => {
  if (req.user.role !== "tecnico") {
    return res.status(403).json({ error: "Apenas técnicos" });
  }

  try {
    const tec = await pool.query(
      `SELECT id FROM tecnicos WHERE usuario_id = $1 AND ativo = true LIMIT 1`,
      [req.user.id]
    );
    if (tec.rows.length === 0) {
      return res.status(403).json({ error: "Sua conta não está vinculada a um técnico ativo" });
    }
    const tecnicoId = tec.rows[0].id;

    const conditions = ["ch.tecnico_id = $1"];
    const values = [tecnicoId];

    if (req.query.status) {
      const statuses = String(req.query.status)
        .split(",")
        .map((s) => s.trim())
        .filter((s) => ["aberto", "em_atendimento", "fechado"].includes(s));
      if (statuses.length) {
        values.push(statuses);
        conditions.push(`ch.status = ANY($${values.length}::text[])`);
      }
    } else if (req.query.abertos === "1") {
      // Cancelado não é "aberto": o chamado saiu da fila. Sem isto o chamado
      // que o admin cancelou continuava na tela do técnico pedindo atendimento.
      conditions.push(`ch.status NOT IN ('fechado', 'cancelado')`);
    }

    if (req.query.desde) {
      const d = new Date(req.query.desde);
      if (!isNaN(d.getTime())) {
        values.push(d);
        conditions.push(`ch.criado_em >= $${values.length}`);
      }
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const result = await pool.query(
      `SELECT
         ch.id,
         ch.status,
         ch.prioridade,
         ch.categoria,
         ch.titulo,
         ch.descricao,
         ch.condominio_id,
         ch.tecnico_id,
         ch.criado_em,
         ch.atualizado_em,
         ch.fechado_em,
         ch.tecnico_a_caminho_em,
         ch.tecnico_chegou_em,
         c.nome     AS condominio_nome,
         c.endereco AS condominio_endereco,
         c.bairro   AS condominio_bairro,
         c.cidade   AS condominio_cidade,
         c.uf       AS condominio_uf,
         c.lat      AS condominio_lat,
         c.lng      AS condominio_lng,
         cw.telefone AS cliente_telefone,
         cw.nome     AS cliente_nome,
         -- ⚠️ DE ONDE VEIO O CHAMADO, e a lista precisava disto para separar
         -- preventiva do resto (04/09/2026, pedido do Pedro: "na tela de
         -- chamados do admin separe preventiva do restante, porque hoje esta
         -- poluindo"). O campo existe na tabela e no GET /chamados/:id desde
         -- sempre; era a LISTAGEM que nao o trazia, entao o front nao tinha
         -- como distinguir e mostrava tudo junto.
         --
         -- ⚠️ NAO E FILTRO DE PRIORIDADE: preventiva e P4, mas nem todo P4 e
         -- preventiva. Quem manda e a ORIGEM. Mesma decisao do filtro da fila
         -- do turno, no operador.routes.js.
         -- (Sem crase nos comentarios: template literal. Ver CLAUDE.md.)
         ch.plano_manutencao_id
       FROM chamados ch
       LEFT JOIN condominios c ON c.id = ch.condominio_id
       LEFT JOIN conversas_whatsapp cv ON cv.id = ch.conversa_id
       LEFT JOIN clientes_whatsapp cw  ON cw.id = cv.cliente_whatsapp_id
       ${where}
       ORDER BY
         CASE ch.status
           WHEN 'em_atendimento' THEN 0
           WHEN 'aberto' THEN 1
           ELSE 2
         END,
         CASE ch.prioridade
           WHEN 'p1' THEN 0
           WHEN 'p2' THEN 1
           WHEN 'p3' THEN 2
           WHEN 'p4' THEN 3
           ELSE 4
         END,
         ch.criado_em DESC
       LIMIT 500`,
      values
    );

    return res.json(result.rows);
  } catch (err) {
    console.error("[chamados] GET /chamados/meus:", err);
    return res.status(500).json({ error: "Erro ao buscar chamados" });
  }
});

// GET /chamados/meus/:id — detalhe do chamado pro técnico autenticado.
// Inclui: chamado completo + reservatórios do condomínio + última leitura +
// O.S. vinculada (se houver) + últimas mensagens WhatsApp (se houver).
router.get("/meus/:id", authRequired, async (req, res) => {
  if (req.user.role !== "tecnico") {
    return res.status(403).json({ error: "Apenas técnicos" });
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }

  try {
    const tec = await pool.query(
      `SELECT id FROM tecnicos WHERE usuario_id = $1 AND ativo = true LIMIT 1`,
      [req.user.id]
    );
    if (tec.rows.length === 0) {
      return res.status(403).json({ error: "Sua conta não está vinculada a um técnico ativo" });
    }
    const tecnicoId = tec.rows[0].id;

    const chRes = await pool.query(
      `SELECT
         ch.id, ch.status, ch.prioridade, ch.categoria,
         ch.titulo, ch.descricao,
         ch.condominio_id, ch.tecnico_id, ch.conversa_id,
         os.id AS ordem_servico_id,
         ch.criado_em, ch.atualizado_em, ch.fechado_em,
         ch.tecnico_a_caminho_em, ch.tecnico_chegou_em,
         c.nome     AS condominio_nome,
         c.endereco AS condominio_endereco,
         c.bairro   AS condominio_bairro,
         c.cidade   AS condominio_cidade,
         c.uf       AS condominio_uf,
         c.cep      AS condominio_cep,
         c.lat      AS condominio_lat,
         c.lng      AS condominio_lng,
         c.telefone AS condominio_telefone,
         c.responsavel AS condominio_responsavel,
         cw.telefone AS cliente_telefone,
         cw.nome     AS cliente_nome
       FROM chamados ch
       LEFT JOIN condominios c ON c.id = ch.condominio_id
       LEFT JOIN conversas_whatsapp cv ON cv.id = ch.conversa_id
       LEFT JOIN clientes_whatsapp cw  ON cw.id = cv.cliente_whatsapp_id
       LEFT JOIN ordens_servico os     ON os.chamado_id = ch.id
       WHERE ch.id = $1 AND ch.tecnico_id = $2`,
      [id, tecnicoId]
    );

    if (chRes.rows.length === 0) {
      return res.status(404).json({ error: "Chamado não encontrado ou não atribuído a você" });
    }
    const chamado = chRes.rows[0];

    // Reservatórios + última leitura (limite 5 min sem leitura = offline)
    let reservatorios = [];
    if (chamado.condominio_id) {
      const r = await pool.query(
        `SELECT
           r.id, r.nome, r.tipo, r.device_id, r.altura_total_m,
           ul.nivel         AS ultima_nivel,
           ul.nivel_pct     AS ultima_nivel_pct,
           ul.bomba_ligada  AS ultima_bomba_ligada,
           ul.criado_em     AS ultima_criado_em,
           CASE
             WHEN r.last_seen IS NULL THEN true
             WHEN (NOW() - r.last_seen) > interval '15 minutes' THEN true
             ELSE false
           END AS offline,
           COALESCE(a.alertas_abertos_count, 0) AS alertas_abertos_count
         FROM reservatorios r
         LEFT JOIN LATERAL (
           SELECT nivel, nivel_pct, bomba_ligada, criado_em
           FROM leituras
           WHERE device_id = r.device_id
           ORDER BY criado_em DESC
           LIMIT 1
         ) ul ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS alertas_abertos_count
           FROM alertas
           WHERE device_id = r.device_id AND status = 'aberto'
         ) a ON true
         WHERE r.condominio_id = $1
         ORDER BY r.id`,
        [chamado.condominio_id]
      );
      reservatorios = r.rows;
    }

    // O.S. vinculada
    let ordemServico = null;
    if (chamado.ordem_servico_id) {
      const os = await pool.query(
        `SELECT id, numero, chegada_em, chegada_lat, chegada_lng,
                saida_em, finalizada_em
         FROM ordens_servico WHERE chamado_id = $1`,
        [chamado.id]
      );
      ordemServico = os.rows[0] || null;
    }

    // Últimas 10 mensagens da conversa WhatsApp (se houver)
    let mensagens = [];
    if (chamado.conversa_id) {
      const m = await pool.query(
        `SELECT direcao, tipo, conteudo, ia_resumo, criado_em
         FROM mensagens_whatsapp
         WHERE conversa_id = $1
         ORDER BY criado_em DESC
         LIMIT 10`,
        [chamado.conversa_id]
      );
      mensagens = m.rows.reverse();
    }

    return res.json({ ...chamado, reservatorios, ordem_servico: ordemServico, mensagens });
  } catch (err) {
    console.error("[chamados] GET /chamados/meus/:id:", err);
    return res.status(500).json({ error: "Erro ao buscar chamado" });
  }
});

// ============================================================
// Mensagens do chamado para o técnico (thread cliente↔técnico).
// Persistidas em alerta_comentarios (alerta_origem='chamado').
// Acesso só para o técnico atribuído ao chamado.
// ============================================================

async function _tecnicoDoChamado(userId, chamadoId) {
  const tec = await pool.query(
    `SELECT id FROM tecnicos WHERE usuario_id = $1 AND ativo = true LIMIT 1`,
    [userId]
  );
  if (tec.rows.length === 0) return null;
  const tecnicoId = tec.rows[0].id;

  const ch = await pool.query(
    `SELECT id FROM chamados WHERE id = $1 AND tecnico_id = $2 LIMIT 1`,
    [chamadoId, tecnicoId]
  );
  if (ch.rows.length === 0) return null;
  return tecnicoId;
}

// GET /chamados/meus/:id/mensagens
router.get("/meus/:id/mensagens", authRequired, async (req, res) => {
  if (req.user.role !== "tecnico") {
    return res.status(403).json({ error: "Apenas técnicos" });
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  try {
    const tecnicoId = await _tecnicoDoChamado(req.user.id, id);
    if (!tecnicoId) return res.status(404).json({ error: "Chamado não encontrado" });

    const r = await pool.query(
      `SELECT c.id, c.texto, c.foto_url, c.criado_em,
              c.autor_id, u.nome AS autor_nome, u.role AS autor_role
       FROM alerta_comentarios c
       LEFT JOIN usuarios u ON u.id = c.autor_id
       WHERE c.alerta_origem = 'chamado' AND c.alerta_id = $1
       ORDER BY c.criado_em ASC`,
      [id]
    );
    return res.json(r.rows);
  } catch (e) {
    console.error("[chamados] GET /meus/:id/mensagens:", e);
    return res.status(500).json({ error: "Erro ao buscar mensagens" });
  }
});

// POST /chamados/meus/:id/mensagens   body: { texto?, foto_base64? }
router.post("/meus/:id/mensagens", authRequired, async (req, res) => {
  if (req.user.role !== "tecnico") {
    return res.status(403).json({ error: "Apenas técnicos" });
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  const { texto, foto_base64 } = req.body || {};
  const t = texto && typeof texto === "string" ? texto.trim() : "";
  if (!t && !foto_base64) return res.status(400).json({ error: "Envie texto ou foto" });
  if (t.length > 2000) return res.status(400).json({ error: "Texto muito longo (máx 2000)" });

  try {
    const tecnicoId = await _tecnicoDoChamado(req.user.id, id);
    if (!tecnicoId) return res.status(404).json({ error: "Chamado não encontrado" });

    let fotoUrl = null;
    if (foto_base64) {
      try {
        ({ url: fotoUrl } = await salvarFotoMensagemChamado(id, foto_base64));
      } catch (e) {
        const code = e.code === "muito_grande" ? 413 : 400;
        return res.status(code).json({ error: e.message });
      }
    }

    const ins = await pool.query(
      `INSERT INTO alerta_comentarios (alerta_origem, alerta_id, autor_id, texto, foto_url)
       VALUES ('chamado', $1, $2, $3, $4)
       RETURNING id, texto, foto_url, criado_em, autor_id`,
      [id, req.user.id, t || null, fotoUrl]
    );
    const row = ins.rows[0];
    // Fase 8A: técnico mandando msg conta como primeira resposta humana.
    pool.query(
      `UPDATE chamados SET primeira_resposta_em = COALESCE(primeira_resposta_em, NOW()) WHERE id = $1`,
      [id]
    ).catch((e) => console.error("[chamados] hook primeira_resposta_em msg-tec:", e.message));
    return res.status(201).json({
      ...row,
      autor_nome: req.user.nome || null,
      autor_role: req.user.role || "tecnico",
    });
  } catch (e) {
    console.error("[chamados] POST /meus/:id/mensagens:", e);
    return res.status(500).json({ error: "Erro ao enviar mensagem" });
  }
});

// POST /chamados/:id/iniciar-atendimento — técnico inicia atendimento.
// Recebe {lat, lng, precisao_m?}. Idempotente: se já existe O.S. pra esse
// chamado (UNIQUE em ordens_servico.chamado_id), retorna ela. Caso contrário
// muda status pra em_atendimento e cria O.S. rascunho com chegada_em/lat/lng.
router.post("/:id/iniciar-atendimento", authRequired, async (req, res) => {
  if (req.user.role !== "tecnico") {
    return res.status(403).json({ error: "Apenas técnicos" });
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }

  const { lat, lng, precisao_m } = req.body || {};
  const latN = Number(lat);
  const lngN = Number(lng);
  if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
    return res.status(400).json({ error: "lat e lng são obrigatórios" });
  }
  if (latN < -90 || latN > 90 || lngN < -180 || lngN > 180) {
    return res.status(400).json({ error: "lat/lng fora de range" });
  }

  const client = await pool.connect();
  try {
    const tec = await client.query(
      `SELECT id FROM tecnicos WHERE usuario_id = $1 AND ativo = true LIMIT 1`,
      [req.user.id]
    );
    if (tec.rows.length === 0) {
      return res.status(403).json({ error: "Sua conta não está vinculada a um técnico ativo" });
    }
    const tecnicoId = tec.rows[0].id;

    const ch = await client.query(
      `SELECT id, status, prioridade, categoria, responsavel_id,
              condominio_id, tecnico_id
       FROM chamados WHERE id = $1`,
      [id]
    );
    if (ch.rows.length === 0) {
      return res.status(404).json({ error: "Chamado não encontrado" });
    }
    const chamado = ch.rows[0];
    const antesIniciar = {
      status: chamado.status,
      prioridade: chamado.prioridade,
      categoria: chamado.categoria,
      responsavel_id: chamado.responsavel_id,
      tecnico_id: chamado.tecnico_id,
      condominio_id: chamado.condominio_id,
    };
    if (chamado.tecnico_id !== tecnicoId) {
      return res.status(403).json({ error: "Chamado não está atribuído a você" });
    }
    if (chamado.status === "fechado") {
      return res.status(400).json({ error: "Chamado já fechado" });
    }

    await client.query("BEGIN");

    // Idempotência: UNIQUE em ordens_servico.chamado_id garante 1:1.
    // Se já existe O.S., retorna ela sem criar outra.
    const existing = await client.query(
      `SELECT id, numero, chegada_em, chegada_lat, chegada_lng, finalizada_em
       FROM ordens_servico WHERE chamado_id = $1`,
      [id]
    );
    let osRow = existing.rows[0] || null;

    if (!osRow) {
      const novaOs = await client.query(
        `INSERT INTO ordens_servico
           (numero, chamado_id, condominio_id, tecnico_id,
            chegada_em, chegada_lat, chegada_lng)
         VALUES (
           'OS-' || EXTRACT(YEAR FROM NOW())::text || '-' || LPAD(nextval('os_numero_seq')::text, 4, '0'),
           $1, $2, $3,
           NOW(), $4, $5
         )
         RETURNING id, numero, chegada_em, chegada_lat, chegada_lng, finalizada_em`,
        [id, chamado.condominio_id, tecnicoId, latN, lngN]
      );
      osRow = novaOs.rows[0];

      await client.query(
        `UPDATE chamados
            SET status = 'em_atendimento',
                primeira_resposta_em = COALESCE(primeira_resposta_em, NOW()),
                atualizado_em = NOW()
          WHERE id = $1`,
        [id]
      );
    } else if (chamado.status !== "em_atendimento") {
      // O.S. já existe (foi criada manualmente ou ficou pendente),
      // mas chamado ainda não está em_atendimento — só atualiza status.
      await client.query(
        `UPDATE chamados
            SET status = 'em_atendimento',
                primeira_resposta_em = COALESCE(primeira_resposta_em, NOW()),
                atualizado_em = NOW()
          WHERE id = $1`,
        [id]
      );
    }

    // Também grava a primeira posição em tecnico_localizacoes
    // (independe se o tracking contínuo subiu — ao menos a chegada fica)
    const precN = precisao_m != null ? Number(precisao_m) : null;
    await client.query(
      `INSERT INTO tecnico_localizacoes
         (tecnico_id, lat, lng, precisao_m, capturada_em, atualizada_em)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (tecnico_id) DO UPDATE SET
         lat = EXCLUDED.lat, lng = EXCLUDED.lng,
         precisao_m = EXCLUDED.precisao_m,
         capturada_em = NOW(), atualizada_em = NOW()`,
      [tecnicoId, latN, lngN, Number.isFinite(precN) ? precN : null]
    );

    // Audit log: status transitou pra em_atendimento (se de fato mudou).
    const depoisIniciar = { ...antesIniciar, status: "em_atendimento" };
    await registrarMudancas({
      client,
      chamadoId: id,
      antes: antesIniciar,
      depois: depoisIniciar,
      alteradoPor: req.user.id,
    });

    await client.query("COMMIT");

    return res.json({
      chamado_id: id,
      status: "em_atendimento",
      ordem_servico: osRow,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[chamados] POST /:id/iniciar-atendimento:", err);
    return res.status(500).json({ error: "Erro ao iniciar atendimento" });
  } finally {
    client.release();
  }
});

// GET /chamados/:id/historico — timeline cronológica de mudanças do chamado.
// Retorna linhas de historico_chamados + nome do autor (LEFT JOIN usuarios).
// alterado_por = NULL significa "sistema" (IA, jobs).
router.get("/:id/historico", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }
  try {
    const r = await pool.query(
      `SELECT h.id, h.campo_alterado, h.valor_anterior, h.valor_novo,
              h.alterado_em, h.alterado_por,
              u.nome AS alterado_por_nome,
              u.role AS alterado_por_role
       FROM historico_chamados h
       LEFT JOIN usuarios u ON u.id = h.alterado_por
       WHERE h.chamado_id = $1
       ORDER BY h.alterado_em ASC, h.id ASC`,
      [id]
    );
    return res.json(r.rows);
  } catch (err) {
    console.error("[chamados] GET /:id/historico:", err);
    return res.status(500).json({ error: "Erro ao buscar histórico" });
  }
});

// GET /chamados/:id — detalhe do chamado
router.get("/:id", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }

  try {
    const chamado = await pool.query(
      `SELECT
         ch.*,
         c.nome  AS condominio_nome,
         u.nome  AS responsavel_nome,
         t.nome  AS tecnico_nome,
         cw.telefone AS cliente_telefone,
         cw.nome     AS cliente_nome,
         pm.titulo   AS plano_titulo,
         os.id       AS ordem_servico_id
       FROM chamados ch
       LEFT JOIN condominios c  ON c.id  = ch.condominio_id
       LEFT JOIN usuarios u     ON u.id  = ch.responsavel_id
       LEFT JOIN tecnicos t     ON t.id  = ch.tecnico_id
       LEFT JOIN conversas_whatsapp cv ON cv.id = ch.conversa_id
       LEFT JOIN clientes_whatsapp cw  ON cw.id = cv.cliente_whatsapp_id
       LEFT JOIN planos_manutencao pm  ON pm.id = ch.plano_manutencao_id
       LEFT JOIN ordens_servico os     ON os.chamado_id = ch.id
       WHERE ch.id = $1`,
      [id]
    );

    if (chamado.rows.length === 0) {
      return res.status(404).json({ error: "Chamado não encontrado" });
    }

    // Busca mensagens da conversa vinculada
    let mensagens = [];
    if (chamado.rows[0].conversa_id) {
      const msgs = await pool.query(
        `SELECT direcao, tipo, conteudo, ia_categoria, ia_urgencia, ia_resumo, criado_em
         FROM mensagens_whatsapp
         WHERE conversa_id = $1
         ORDER BY criado_em ASC`,
        [chamado.rows[0].conversa_id]
      );
      mensagens = msgs.rows;
    }

    return res.json({ ...chamado.rows[0], mensagens });
  } catch (err) {
    console.error("[chamados] GET /chamados/:id:", err);
    return res.status(500).json({ error: "Erro ao buscar chamado" });
  }
});

// PATCH /chamados/:id — atualiza status, prioridade ou responsável
//
// ⚠️ `cancelado` NÃO É `fechado` (04/09/2026). Fechar diz "o serviço foi
// feito" e alimenta `tempo_resolucao_seg`, a taxa de resolução e o tempo médio
// do painel. Chamado aberto por engano, duplicado ou desistido pelo cliente
// não é nada disso — e até aqui a única saída dele era fechar, o que enfiava
// cada engano na métrica como atendimento cumprido. Cancelar tira o chamado da
// fila SEM entrar em conta nenhuma.
router.patch("/:id", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }

  const { status, prioridade, categoria, responsavel_id, condominio_id, tecnico_id, motivo } = req.body || {};

  const STATUSES   = ["aberto", "fechado", "cancelado"];
  const PRIORIDADES = ["p1", "p2", "p3", "p4"];

  if (status && !STATUSES.includes(status)) {
    return res.status(400).json({ error: `status deve ser: ${STATUSES.join(", ")} — em_atendimento só é permitido via /iniciar-atendimento` });
  }

  // ⚠️ CANCELAR É DE GESTÃO, FECHAR É DE OPERAÇÃO. `adminOnly` deixa o
  // operador passar (ver `middleware/gestaoOnly.js`): fechar chamado é o dia
  // dele, mas apagar da métrica um chamado que existiu é decisão de negócio.
  let motivoCancelamento = null;
  if (status === "cancelado") {
    if (!GESTAO_ROLES.includes(req.user?.role)) {
      return res.status(403).json({ error: "Cancelar chamado é restrito à gestão (admin ou gerente)" });
    }
    // Chamado cancelado sem o porquê recria a ambiguidade que o `fechado`
    // tinha: quem olhar depois não sabe se foi engano, duplicata ou desistência.
    motivoCancelamento = String(motivo || "").trim();
    if (motivoCancelamento.length < 5) {
      return res.status(400).json({ error: "Descreva o motivo do cancelamento (mínimo 5 caracteres)" });
    }
    if (motivoCancelamento.length > 500) {
      return res.status(400).json({ error: "Motivo muito longo (máx 500 caracteres)" });
    }
  }
  if (prioridade && !PRIORIDADES.includes(prioridade)) {
    return res.status(400).json({ error: `prioridade deve ser: ${PRIORIDADES.join(", ")}` });
  }
  if (categoria && !CATEGORIAS.includes(categoria)) {
    return res.status(400).json({ error: `categoria deve ser: ${CATEGORIAS.join(", ")}` });
  }

  const sets = ["atualizado_em = NOW()"];
  const values = [];

  // Fase 8A: o que conta como "primeira resposta da equipe" (TTFR). Marcado
  // no fim, uma vez só — o COALESCE no SQL garante que a primeira escrita
  // ganha, então reatribuições posteriores não mexem no valor já gravado.
  let tocouOChamado = false;

  if (status) {
    values.push(status);
    sets.push(`status = $${values.length}`);
    if (status === "fechado") {
      sets.push("fechado_em = NOW()");
      // Fase 8A: tempo_resolucao_seg = quanto demorou pra resolver, em segundos.
      sets.push("tempo_resolucao_seg = GREATEST(0, EXTRACT(EPOCH FROM (NOW() - criado_em))::int)");
    } else if (status === "cancelado") {
      // ⚠️ NEM `fechado_em` NEM `tempo_resolucao_seg`. Cancelar não é resolver:
      // o chamado sai da fila sem produzir tempo de resolução nenhum, senão o
      // engano volta pela porta dos fundos na média do painel.
      values.push(motivoCancelamento);
      sets.push(`cancelado_motivo = $${values.length}`);
      sets.push("cancelado_em = NOW()");
    } else {
      // Reabertura (status saindo de 'fechado'): zera o tempo de resolução
      // pra ser recalculado no próximo fechamento. fechado_em fica como
      // memória do último fechamento.
      // Reabertura vinda de 'cancelado' não zera nada — não havia tempo de
      // resolução para zerar; `cancelado_em`/`cancelado_motivo` ficam como
      // memória do último cancelamento, pelo mesmo motivo do `fechado_em`.
      sets.push("tempo_resolucao_seg = CASE WHEN status = 'fechado' THEN NULL ELSE tempo_resolucao_seg END");
    }
    // Qualquer transição saindo de 'aberto' conta como primeira resposta.
    //
    // ⚠️ MENOS O CANCELAMENTO. Cancelar não é responder: marcar TTFR aqui faria
    // o chamado que ninguém atendeu sair do relatório como atendido dentro do
    // prazo — e `primeira_resposta_em` vai cru no CSV de `GET /relatorios/chamados`.
    if (status !== "aberto" && status !== "cancelado") tocouOChamado = true;
  }
  if (prioridade) {
    values.push(prioridade);
    sets.push(`prioridade = $${values.length}`);
  }
  if (categoria) {
    values.push(categoria);
    sets.push(`categoria = $${values.length}`);
  }
  if (responsavel_id !== undefined) {
    values.push(responsavel_id || null);
    sets.push(`responsavel_id = $${values.length}`);
    // Assumir o chamado é toque humano tanto quanto responder. Desatribuir
    // (null) não conta — ninguém passou a olhar pro chamado por causa disso.
    if (responsavel_id) tocouOChamado = true;
  }
  if (condominio_id !== undefined) {
    const cid = condominio_id ? Number(condominio_id) : null;
    if (cid !== null && (!Number.isInteger(cid) || cid <= 0)) {
      return res.status(400).json({ error: "condominio_id inválido" });
    }
    values.push(cid);
    sets.push(`condominio_id = $${values.length}`);
  }
  if (tecnico_id !== undefined) {
    const tid = tecnico_id ? Number(tecnico_id) : null;
    if (tid !== null && (!Number.isInteger(tid) || tid <= 0)) {
      return res.status(400).json({ error: "tecnico_id inválido" });
    }
    values.push(tid);
    sets.push(`tecnico_id = $${values.length}`);
    // Idem: atribuir técnico marca o TTFR, tirar o técnico não.
    if (tid !== null) tocouOChamado = true;
  }

  if (tocouOChamado) {
    sets.push("primeira_resposta_em = COALESCE(primeira_resposta_em, NOW())");
  }

  if (values.length === 0) {
    return res.status(400).json({ error: "Nenhum campo para atualizar" });
  }

  values.push(id);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const antesRes = await client.query(
      `SELECT status, prioridade, categoria, responsavel_id, tecnico_id, condominio_id
       FROM chamados WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (antesRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Chamado não encontrado" });
    }
    const antes = antesRes.rows[0];

    // ⚠️ CHAMADO FECHADO NÃO SE CANCELA. Fechado é serviço prestado — tem
    // `tempo_resolucao_seg` gravado, provavelmente O.S. finalizada e talvez
    // avaliação do cliente. Cancelar apagaria da métrica um atendimento que
    // aconteceu de verdade. Se foi fechado por engano, o caminho é reabrir e
    // então cancelar — duas decisões, duas linhas no histórico.
    if (status === "cancelado" && antes.status === "fechado") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "Chamado fechado não pode ser cancelado. Reabra primeiro, se foi fechado por engano.",
      });
    }

    const result = await client.query(
      `UPDATE chamados SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *`,
      values
    );
    const depois = result.rows[0];

    await registrarMudancas({
      client,
      chamadoId: id,
      antes,
      depois,
      alteradoPor: req.user.id,
    });

    await client.query("COMMIT");
    return res.json(depois);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[chamados] PATCH /chamados/:id:", err);
    return res.status(500).json({ error: "Erro ao atualizar chamado" });
  } finally {
    client.release();
  }
});

// POST /chamados/:id/a-caminho — técnico registra que está a caminho
router.post("/:id/a-caminho", authRequired, async (req, res) => {
  if (!["tecnico", "admin"].includes(req.user.role)) {
    return res.status(403).json({ error: "Sem permissão" });
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  try {
    const r = await pool.query(
      `UPDATE chamados
       SET tecnico_a_caminho_em = COALESCE(tecnico_a_caminho_em, NOW()),
           atualizado_em = NOW()
       WHERE id = $1
       RETURNING id, tecnico_a_caminho_em, tecnico_chegou_em`,
      [id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Chamado não encontrado" });
    return res.json(r.rows[0]);
  } catch (err) {
    console.error("[chamados] POST /:id/a-caminho:", err);
    return res.status(500).json({ error: "Erro ao registrar deslocamento" });
  }
});

// POST /chamados/:id/chegou — técnico registra chegada (marca SLA de chegada)
router.post("/:id/chegou", authRequired, async (req, res) => {
  if (!["tecnico", "admin"].includes(req.user.role)) {
    return res.status(403).json({ error: "Sem permissão" });
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "id inválido" });

  try {
    const r = await pool.query(
      `UPDATE chamados
       SET tecnico_chegou_em    = COALESCE(tecnico_chegou_em, NOW()),
           tecnico_a_caminho_em = COALESCE(tecnico_a_caminho_em, NOW()),
           primeira_resposta_em = COALESCE(primeira_resposta_em, NOW()),
           atualizado_em        = NOW()
       WHERE id = $1
       RETURNING id, tecnico_a_caminho_em, tecnico_chegou_em`,
      [id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Chamado não encontrado" });
    return res.json(r.rows[0]);
  } catch (err) {
    console.error("[chamados] POST /:id/chegou:", err);
    return res.status(500).json({ error: "Erro ao registrar chegada" });
  }
});

module.exports = { chamadosRouter: router };
