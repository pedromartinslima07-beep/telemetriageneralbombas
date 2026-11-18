// src/routes/agenda.routes.js
//
// Agenda da empresa (fase A, 18/11/2026). Junta num só lugar:
//   · compromissos lançados à mão (tabela `compromissos`, migration 092),
//     com repetição semanal ou mensal expandida aqui;
//   · o que o sistema já sabe: retorno pedido na O.S., contrato nosso
//     vencendo, preventivas do mês;
//   · o faturamento dos contratos do Omie (cópia em `omie_contratos` /
//     `omie_contrato_notas`, ver omie-faturamento.service.js).
//
// Quem vê: gestão (admin e gerente). Pagamento e o que é financeiro
// (`so_admin`, e o faturamento do Omie) só o admin — decisão do Pedro.
//
// ⚠️ FUSO: o servidor roda em UTC (Railway) e a empresa em São Paulo, que não
// tem horário de verão desde 2019 (-03:00 fixo). Expandir repetição em UTC
// trocaria o dia de um compromisso das 22h. Toda conta de dia é feita no
// relógio de São Paulo (_spDia / _spData).

const express = require("express");
const { pool } = require("../db");
const { authRequired } = require("../middleware/authRequired");
const { gestaoOnly } = require("../middleware/gestaoOnly");
const { masterAdminOnly } = require("../middleware/masterAdminOnly");
const fat = require("../services/omie-faturamento.service");

const router = express.Router();
router.use(authRequired, gestaoOnly);

const TIPOS = ["reuniao", "visita", "pagamento", "financeiro", "outro"];
const REPETICOES = ["nenhuma", "semanal", "mensal"];
const SP_OFFSET_MS = 3 * 60 * 60 * 1000;
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const _ehAdmin = (req) => req.user?.role === "admin";

// "AAAA-MM-DD" do dia em São Paulo de um instante.
function _spDia(d) { return new Date(d.getTime() - SP_OFFSET_MS).toISOString().slice(0, 10); }
// Instante da meia-noite de São Paulo de um "AAAA-MM-DD".
function _spMeiaNoite(dia) { return new Date(`${dia}T00:00:00-03:00`); }
function _diaValido(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && !isNaN(_spMeiaNoite(s)); }
// Soma meses mantendo o dia (31 → último dia do mês curto), no relógio de SP.
function _somarMeses(d, n, diaOriginal) {
  const sp = new Date(d.getTime() - SP_OFFSET_MS);
  const alvo = new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth() + n, 1,
    sp.getUTCHours(), sp.getUTCMinutes()));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(diaOriginal, ultimo));
  return new Date(alvo.getTime() + SP_OFFSET_MS);
}

// As ocorrências de um compromisso dentro de [ini, fim).
function _ocorrencias(c, ini, fim) {
  const base = new Date(c.inicio);
  const dur = c.fim ? new Date(c.fim) - base : 0;
  const ate = c.repete_ate ? new Date(_spMeiaNoite(_isoDia(c.repete_ate)).getTime() + 86400000) : null;
  const limite = ate && ate < fim ? ate : fim;
  const out = [];
  if (c.repeticao === "nenhuma") {
    if (base < fim && new Date(base.getTime() + dur) >= ini) out.push(base);
    return out;
  }
  const diaOriginal = Number(_spDia(base).slice(8, 10));
  for (let i = 0, d = base; d < limite && i < 800; i++) {
    if (d >= ini || new Date(d.getTime() + dur) >= ini) out.push(d);
    d = c.repeticao === "semanal" ? new Date(base.getTime() + (i + 1) * 7 * 86400000) : _somarMeses(base, i + 1, diaOriginal);
  }
  return out;
}
function _isoDia(v) { return v instanceof Date ? _spDia(v) : String(v).slice(0, 10); }

function _validar(b, { parcial = false } = {}) {
  const erros = [];
  const out = {};
  if (!parcial || b.titulo !== undefined) {
    const t = String(b.titulo || "").trim();
    if (!t) erros.push("Dê um título ao compromisso.");
    else if (t.length > 160) erros.push("Título com mais de 160 caracteres.");
    else out.titulo = t;
  }
  if (!parcial || b.tipo !== undefined) {
    const t = b.tipo || "outro";
    if (!TIPOS.includes(t)) erros.push("Tipo inválido."); else out.tipo = t;
  }
  if (!parcial || b.inicio !== undefined) {
    const d = new Date(b.inicio);
    if (!b.inicio || isNaN(d)) erros.push("Informe a data do compromisso."); else out.inicio = d.toISOString();
  }
  if (b.fim !== undefined) {
    if (b.fim === null || b.fim === "") out.fim = null;
    else { const d = new Date(b.fim); if (isNaN(d)) erros.push("Hora de fim inválida."); else out.fim = d.toISOString(); }
  }
  if (b.dia_inteiro !== undefined) out.dia_inteiro = !!b.dia_inteiro;
  if (!parcial || b.repeticao !== undefined) {
    const r = b.repeticao || "nenhuma";
    if (!REPETICOES.includes(r)) erros.push("Repetição inválida."); else out.repeticao = r;
  }
  if (b.repete_ate !== undefined) {
    if (!b.repete_ate) out.repete_ate = null;
    else if (!_diaValido(b.repete_ate)) erros.push("Data final da repetição inválida."); else out.repete_ate = b.repete_ate;
  }
  for (const k of ["condominio_id", "responsavel_id"]) {
    if (b[k] !== undefined) {
      if (b[k] === null || b[k] === "") out[k] = null;
      else { const n = Number(b[k]); if (!Number.isInteger(n) || n <= 0) erros.push(`${k} inválido.`); else out[k] = n; }
    }
  }
  if (b.descricao !== undefined) out.descricao = b.descricao ? String(b.descricao).slice(0, 4000) : null;
  if (b.so_admin !== undefined) out.so_admin = !!b.so_admin;
  if (out.inicio && out.fim && new Date(out.fim) < new Date(out.inicio)) erros.push("O fim é antes do início.");
  return { erros, out };
}

// GET /agenda?de=AAAA-MM-DD&ate=AAAA-MM-DD — tudo o que cai no período.
router.get("/", async (req, res) => {
  const { de, ate } = req.query;
  if (!_diaValido(de) || !_diaValido(ate)) return res.status(400).json({ error: "Informe de e ate no formato AAAA-MM-DD." });
  const ini = _spMeiaNoite(de);
  const fim = new Date(_spMeiaNoite(ate).getTime() + 86400000);
  if (fim <= ini || fim - ini > 100 * 86400000) return res.status(400).json({ error: "Período inválido (até 100 dias)." });
  const admin = _ehAdmin(req);

  try {
    const itens = [];
    const meses = [];
    for (let d = new Date(`${de.slice(0, 7)}-01T12:00:00Z`); d < fim; d.setUTCMonth(d.getUTCMonth() + 1)) {
      meses.push(d.toISOString().slice(0, 7));
    }

    // ⚠️ AS CONSULTAS SAEM TODAS DE UMA VEZ. Em sequência eram ~12 idas ao
    // banco para montar um mês (5 s no banco de teste, que fica a ~200 ms
    // daqui). Nenhuma depende da outra.
    const [rc, ro, rk, porMes] = await Promise.all([
      // 1. Compromissos lançados à mão (com as repetições do período).
      pool.query(
        `SELECT c.*, COALESCE(NULLIF(cd.nome_fantasia,''), cd.nome) AS condominio_nome, u.nome AS responsavel_nome
           FROM compromissos c
           LEFT JOIN condominios cd ON cd.id = c.condominio_id
           LEFT JOIN usuarios u ON u.id = c.responsavel_id
          WHERE c.apagado_em IS NULL
            AND c.inicio < $2
            AND (c.repeticao <> 'nenhuma' OR COALESCE(c.fim, c.inicio) >= $1)
            AND ($3 OR NOT c.so_admin)`,
        [ini.toISOString(), fim.toISOString(), admin]
      ),
      // 2. Retorno pedido na O.S. (o técnico marcou "necessita retorno").
      pool.query(
        `SELECT os.id, os.numero, os.retorno_sugerido_em, os.condominio_id,
                COALESCE(NULLIF(cd.nome_fantasia,''), cd.nome) AS condominio_nome
           FROM ordens_servico os
           LEFT JOIN condominios cd ON cd.id = os.condominio_id
          WHERE os.necessario_retorno = TRUE AND os.finalizada_em IS NOT NULL
            AND os.retorno_sugerido_em >= $1::date AND os.retorno_sugerido_em <= $2::date`,
        [de, ate]
      ),
      // 3. Contrato nosso que acaba no período.
      pool.query(
        `SELECT k.id, k.fim_em, k.condominio_id, COALESCE(NULLIF(cd.nome_fantasia,''), cd.nome) AS condominio_nome
           FROM contratos k LEFT JOIN condominios cd ON cd.id = k.condominio_id
          WHERE k.ativo = TRUE AND k.fim_em >= $1::date AND k.fim_em <= $2::date`,
        [de, ate]
      ),
      // 4. Preventivas e 5. faturamento do Omie, mês a mês.
      Promise.all(meses.map(async comp => {
        const [rp, r] = await Promise.all([
          pool.query(
            `SELECT COUNT(*) FILTER (WHERE status NOT IN ('fechado','cancelado'))::int AS abertas,
                    COUNT(*) FILTER (WHERE status = 'fechado')::int AS feitas
               FROM chamados WHERE plano_manutencao_id IS NOT NULL AND competencia = $1::date`,
            [`${comp}-01`]
          ),
          admin ? fat.retratoDoMes(comp).catch(() => null) : null,
        ]);
        return { comp, prev: rp.rows[0], fat: r };
      })),
    ]);

    for (const c of rc.rows) {
      const dur = c.fim ? new Date(c.fim) - new Date(c.inicio) : 0;
      for (const d of _ocorrencias(c, ini, fim)) {
        itens.push({
          id: `c-${c.id}-${d.getTime()}`, fonte: "compromisso", compromisso_id: c.id,
          tipo: c.tipo, titulo: c.titulo, inicio: d.toISOString(), serie_inicio: new Date(c.inicio).toISOString(),
          fim: c.fim ? new Date(d.getTime() + dur).toISOString() : null,
          dia_inteiro: c.dia_inteiro, repeticao: c.repeticao, repete_ate: c.repete_ate ? _isoDia(c.repete_ate) : null,
          condominio_id: c.condominio_id, condominio_nome: c.condominio_nome,
          responsavel_id: c.responsavel_id, responsavel_nome: c.responsavel_nome,
          descricao: c.descricao, so_admin: c.so_admin, editavel: true,
        });
      }
    }
    for (const o of ro.rows) {
      itens.push({
        id: `os-${o.id}`, fonte: "os", tipo: "retorno", os_id: o.id,
        titulo: `Retorno pedido na ${o.numero}`, inicio: _spMeiaNoite(_isoDia(o.retorno_sugerido_em)).toISOString(),
        dia_inteiro: true, condominio_id: o.condominio_id, condominio_nome: o.condominio_nome, editavel: false,
      });
    }
    for (const k of rk.rows) {
      itens.push({
        id: `ctr-${k.id}`, fonte: "contrato", tipo: "contrato", contrato_id: k.id,
        titulo: "Contrato termina", inicio: _spMeiaNoite(_isoDia(k.fim_em)).toISOString(),
        dia_inteiro: true, condominio_id: k.condominio_id, condominio_nome: k.condominio_nome, editavel: false,
      });
    }
    for (const { comp, prev: p, fat: r } of porMes) {
      const mes = Number(comp.slice(5, 7));
      const dia1 = `${comp}-01`;
      if ((p.abertas + p.feitas) > 0 && _spMeiaNoite(dia1) >= ini && _spMeiaNoite(dia1) < fim) {
        itens.push({
          id: `prev-${comp}`, fonte: "preventivas", tipo: "preventiva", competencia: comp,
          titulo: `Preventivas de ${MESES[mes - 1]}: ${p.feitas} feitas, ${p.abertas} a fazer`,
          inicio: _spMeiaNoite(dia1).toISOString(), dia_inteiro: true, editavel: false,
        });
      }
      if (r && r.esperados > 0) {
        const diaFat = `${comp}-${String(Math.min(r.dia_faturamento || 1, 28)).padStart(2, "0")}`;
        if (_spMeiaNoite(diaFat) >= ini && _spMeiaNoite(diaFat) < fim) {
          itens.push({
            id: `fat-${comp}`, fonte: "omie", tipo: "faturamento", competencia: comp,
            titulo: `Faturar contratos no Omie: ${r.faturados} de ${r.esperados}`,
            inicio: _spMeiaNoite(diaFat).toISOString(), dia_inteiro: true, so_admin: true, editavel: false,
            concluido: r.faturados >= r.esperados,
          });
        }
      }
    }

    itens.sort((a, b) => new Date(a.inicio) - new Date(b.inicio) || (b.dia_inteiro - a.dia_inteiro));
    res.json({ de, ate, itens });
  } catch (err) {
    console.error("[agenda] GET /:", err);
    res.status(500).json({ error: "Erro ao montar a agenda." });
  }
});

// GET /agenda/faturamento?competencia=AAAA-MM — o retrato do mês (admin).
router.get("/faturamento", masterAdminOnly, async (req, res) => {
  const comp = String(req.query.competencia || fat.competenciaDe(new Date()));
  if (!/^\d{4}-\d{2}$/.test(comp)) return res.status(400).json({ error: "competencia no formato AAAA-MM." });
  try { res.json(await fat.retratoDoMes(comp)); }
  catch (err) { console.error("[agenda] GET /faturamento:", err); res.status(500).json({ error: "Erro ao ler o faturamento." }); }
});

// POST /agenda/faturamento/atualizar — busca de novo no Omie (admin).
router.post("/faturamento/atualizar", masterAdminOnly, async (req, res) => {
  try { res.json(await fat.sincronizar()); }
  catch (err) {
    console.error("[agenda] atualizar faturamento:", err.message);
    res.status(err.status && err.status < 600 ? err.status : 502).json({ error: "O Omie não respondeu: " + err.message });
  }
});

// POST /agenda/compromissos
router.post("/compromissos", async (req, res) => {
  const { erros, out } = _validar(req.body || {});
  if (erros.length) return res.status(400).json({ error: erros.join(" ") });
  // Pagamento é financeiro: nasce só para o admin, e só o admin cria.
  if (out.tipo === "pagamento" || out.tipo === "financeiro") out.so_admin = true;
  if (out.so_admin && !_ehAdmin(req)) return res.status(403).json({ error: "Só o admin lança compromisso financeiro." });
  try {
    const r = await pool.query(
      `INSERT INTO compromissos (titulo, tipo, inicio, fim, dia_inteiro, repeticao, repete_ate, condominio_id,
                                 responsavel_id, descricao, so_admin, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [out.titulo, out.tipo, out.inicio, out.fim ?? null, out.dia_inteiro ?? false, out.repeticao,
       out.repete_ate ?? null, out.condominio_id ?? null, out.responsavel_id ?? null, out.descricao ?? null,
       out.so_admin ?? false, req.user.id]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error("[agenda] POST /compromissos:", err);
    res.status(500).json({ error: "Erro ao salvar o compromisso." });
  }
});

async function _carregar(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "id inválido" }); return null; }
  const r = await pool.query(`SELECT * FROM compromissos WHERE id = $1 AND apagado_em IS NULL`, [id]);
  const c = r.rows[0];
  if (!c || (c.so_admin && !_ehAdmin(req))) { res.status(404).json({ error: "Compromisso não encontrado." }); return null; }
  return c;
}

// PATCH /agenda/compromissos/:id
router.patch("/compromissos/:id", async (req, res) => {
  try {
    const atual = await _carregar(req, res);
    if (!atual) return;
    const { erros, out } = _validar(req.body || {}, { parcial: true });
    if (erros.length) return res.status(400).json({ error: erros.join(" ") });
    const tipoFinal = out.tipo || atual.tipo;
    if (tipoFinal === "pagamento" || tipoFinal === "financeiro") out.so_admin = true;
    if (out.so_admin && !_ehAdmin(req)) return res.status(403).json({ error: "Só o admin lança compromisso financeiro." });
    const campos = Object.keys(out);
    if (!campos.length) return res.json(atual);
    const sets = campos.map((k, i) => `${k} = $${i + 2}`).join(", ");
    const r = await pool.query(
      `UPDATE compromissos SET ${sets}, atualizado_em = NOW() WHERE id = $1 RETURNING *`,
      [atual.id, ...campos.map(k => out[k])]
    );
    res.json(r.rows[0]);
  } catch (err) {
    console.error("[agenda] PATCH /compromissos:", err);
    res.status(500).json({ error: "Erro ao salvar o compromisso." });
  }
});

// DELETE /agenda/compromissos/:id — marca como apagado (a agenda é registro).
router.delete("/compromissos/:id", async (req, res) => {
  try {
    const atual = await _carregar(req, res);
    if (!atual) return;
    await pool.query(`UPDATE compromissos SET apagado_em = NOW() WHERE id = $1`, [atual.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("[agenda] DELETE /compromissos:", err);
    res.status(500).json({ error: "Erro ao apagar o compromisso." });
  }
});

module.exports = router;
module.exports._ocorrencias = _ocorrencias; // para o teste
