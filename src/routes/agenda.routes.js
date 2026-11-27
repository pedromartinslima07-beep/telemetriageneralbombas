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
// O lote grava no Omie: só os logins do painel novo (PAINEL_NOVO), ver
// src/services/painel-novo.service.js.
const { painelNovoOnly } = require("../services/painel-novo.service");
const fat = require("../services/omie-faturamento.service");
const lote = require("../services/omie-lote.service");

const router = express.Router();
// ⚠️ O OPERADOR ENTRA, MAS SÓ PELAS VISITAS (27/11/2026). Pedido do Pedro: o
// turno agenda os chamados nos técnicos, e para isso precisa da agenda. Ele vê
// e mexe só no que é de campo: visita ligada a chamado (`chamado_id`) e
// retorno pedido na O.S. Reunião, pagamento, Omie, contratos e o resumo das
// preventivas continuam da gestão. Quem decide é esta rota (_ehOperador),
// não a tela.
router.use(authRequired, (req, res, next) => (req.user?.role === "operador" ? next() : gestaoOnly(req, res, next)));

const TIPOS = ["reuniao", "visita", "pagamento", "financeiro", "outro"];
const REPETICOES = ["nenhuma", "semanal", "mensal"];
const SP_OFFSET_MS = 3 * 60 * 60 * 1000;
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const _ehAdmin = (req) => req.user?.role === "admin";
const _ehOperador = (req) => req.user?.role === "operador";

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
  // chamado_id (migration 093): a visita marcada no quadro de despacho.
  for (const k of ["condominio_id", "responsavel_id", "chamado_id"]) {
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
  const operador = _ehOperador(req);

  try {
    const itens = [];
    const meses = [];
    for (let d = new Date(`${de.slice(0, 7)}-01T12:00:00Z`); d < fim; d.setUTCMonth(d.getUTCMonth() + 1)) {
      meses.push(d.toISOString().slice(0, 7));
    }

    // ⚠️ AS CONSULTAS SAEM TODAS DE UMA VEZ. Em sequência eram ~12 idas ao
    // banco para montar um mês (5 s no banco de teste, que fica a ~200 ms
    // daqui). Nenhuma depende da outra.
    const [rc, ro, rk, porMes, rv, rx, rf, ros] = await Promise.all([
      // 1. Compromissos lançados à mão (com as repetições do período).
      //    Operador: só as visitas de chamado. A janela de 62 dias antes do
      //    período pega a visita remarcada "só esta" para dentro dele.
      pool.query(
        `SELECT c.*, COALESCE(NULLIF(cd.nome_fantasia,''), cd.nome) AS condominio_nome, u.nome AS responsavel_nome,
                ch.status AS chamado_status, ch.tecnico_id AS chamado_tecnico_id,
                ch.prioridade AS chamado_prioridade, ch.titulo AS chamado_titulo
           FROM compromissos c
           LEFT JOIN condominios cd ON cd.id = c.condominio_id
           LEFT JOIN usuarios u ON u.id = c.responsavel_id
           LEFT JOIN chamados ch ON ch.id = c.chamado_id
          WHERE c.apagado_em IS NULL
            AND c.inicio < $2::timestamptz + INTERVAL '62 days'
            AND (c.repeticao <> 'nenhuma' OR COALESCE(c.fim, c.inicio) >= $1::timestamptz - INTERVAL '62 days')
            AND ($3::boolean OR NOT c.so_admin)
            AND (NOT $4::boolean OR c.chamado_id IS NOT NULL)`,
        [ini.toISOString(), fim.toISOString(), admin, operador]
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
      // 3. Contrato nosso que acaba no período (não é assunto do operador).
      operador ? { rows: [] } : pool.query(
        `SELECT k.id, k.fim_em, k.condominio_id, COALESCE(NULLIF(cd.nome_fantasia,''), cd.nome) AS condominio_nome
           FROM contratos k LEFT JOIN condominios cd ON cd.id = k.condominio_id
          WHERE k.ativo = TRUE AND k.fim_em >= $1::date AND k.fim_em <= $2::date`,
        [de, ate]
      ),
      // 4. Preventivas e 5. faturamento do Omie, mês a mês (não do operador).
      operador ? [] : Promise.all(meses.map(async comp => {
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
      // 6. Próxima visita marcada de cada chamado (migration 093), em qualquer
      // semana: o quadro de despacho tira da coluna "a agendar" o chamado que
      // já tem visita, mesmo que ela caia fora do período na tela.
      pool.query(
        `SELECT chamado_id, MIN(inicio) AS proxima
           FROM compromissos
          WHERE chamado_id IS NOT NULL AND apagado_em IS NULL AND inicio >= NOW() - INTERVAL '1 day'
          GROUP BY chamado_id`
      ),
      // 7. Exceções das séries (migration 111): feito, remarcada, cancelada
      //    só nesta vez. Pela ocorrência original perto do período, ou pela
      //    data nova dentro dele.
      pool.query(
        `SELECT o.*, ur.nome AS responsavel_nome, uc.nome AS concluido_por_nome
           FROM compromisso_ocorrencias o
           JOIN compromissos c ON c.id = o.compromisso_id AND c.apagado_em IS NULL
           LEFT JOIN usuarios ur ON ur.id = o.responsavel_id
           LEFT JOIN usuarios uc ON uc.id = o.concluido_por
          WHERE (o.ocorrencia_em >= $1::timestamptz - INTERVAL '62 days' AND o.ocorrencia_em < $2::timestamptz + INTERVAL '62 days')
             OR (o.inicio >= $1::timestamptz AND o.inicio < $2::timestamptz)`,
        [ini.toISOString(), fim.toISOString()]
      ),
      // 8. Feito do retorno de O.S. e do contrato (migration 111).
      pool.query(
        `SELECT f.fonte, f.ref_id, f.concluido_em, u.nome AS concluido_por_nome
           FROM agenda_feitos f LEFT JOIN usuarios u ON u.id = f.concluido_por`
      ),
      // 9. O.S. finalizada no dia da visita: a visita do chamado se marca
      //    sozinha (o técnico não precisa de outro clique além da O.S.).
      pool.query(
        `SELECT os.chamado_id, os.numero, os.finalizada_em, t.nome AS tecnico_nome
           FROM ordens_servico os LEFT JOIN tecnicos t ON t.id = os.tecnico_id
          WHERE os.chamado_id IS NOT NULL AND os.finalizada_em IS NOT NULL
            AND os.finalizada_em >= $1::timestamptz - INTERVAL '1 day' AND os.finalizada_em < $2::timestamptz + INTERVAL '1 day'`,
        [ini.toISOString(), fim.toISOString()]
      ),
    ]);

    const excecoes = new Map(rx.rows.map(o => [`${o.compromisso_id}|${new Date(o.ocorrencia_em).getTime()}`, o]));
    const feitos = new Map(rf.rows.map(f => [`${f.fonte}|${f.ref_id}`, f]));
    const osPorChamadoDia = new Map();
    for (const o of ros.rows) {
      const k = `${o.chamado_id}|${_spDia(new Date(o.finalizada_em))}`;
      if (!osPorChamadoDia.has(k)) osPorChamadoDia.set(k, o);
    }
    const _feito = (f) => f ? { concluido: true, concluido_em: new Date(f.concluido_em).toISOString(), concluido_por_nome: f.concluido_por_nome || null } : { concluido: false };

    // Uma vez da série, com o que mudou só nela (exceção) e o feito.
    const _dentro = (a, b) => a < fim && (b || a) >= ini;
    const _montar = (c, origem, ex) => {
      const dur = c.fim ? new Date(c.fim) - new Date(c.inicio) : 0;
      const ini0 = ex?.inicio ? new Date(ex.inicio) : origem;
      const fim0 = ex?.fim ? new Date(ex.fim) : (c.fim ? new Date(ini0.getTime() + dur) : null);
      // Feito: o marcado à mão vale; sem ele, a O.S. do chamado finalizada
      // no dia da visita marca sozinha.
      let feito = { concluido: false };
      if (ex?.concluido_em) feito = _feito(ex);
      else if (c.chamado_id) {
        const os = osPorChamadoDia.get(`${c.chamado_id}|${_spDia(ini0)}`);
        if (os) feito = { concluido: true, concluido_auto: true, concluido_em: new Date(os.finalizada_em).toISOString(), concluido_por_nome: os.tecnico_nome || null, concluido_os: os.numero };
      }
      return {
        id: `c-${c.id}-${origem.getTime()}`, fonte: "compromisso", compromisso_id: c.id,
        ocorrencia: origem.toISOString(), excecao: !!(ex && (ex.inicio || ex.fim || ex.titulo || ex.descricao || ex.responsavel_id)),
        tipo: c.tipo, titulo: ex?.titulo || c.titulo, inicio: ini0.toISOString(), serie_inicio: new Date(c.inicio).toISOString(),
        fim: fim0 ? fim0.toISOString() : null,
        dia_inteiro: c.dia_inteiro, repeticao: c.repeticao, repete_ate: c.repete_ate ? _isoDia(c.repete_ate) : null,
        condominio_id: c.condominio_id, condominio_nome: c.condominio_nome,
        responsavel_id: ex?.responsavel_id ?? c.responsavel_id, responsavel_nome: ex?.responsavel_id ? ex.responsavel_nome : c.responsavel_nome,
        descricao: ex?.descricao ?? c.descricao, so_admin: c.so_admin, editavel: true,
        chamado_id: c.chamado_id ?? null, chamado_status: c.chamado_status ?? null,
        chamado_tecnico_id: c.chamado_tecnico_id ?? null, chamado_prioridade: c.chamado_prioridade ?? null,
        ...feito,
      };
    };
    for (const c of rc.rows) {
      // As vezes que caem no período pela data original...
      const janelaIni = new Date(ini.getTime() - 62 * 86400000), janelaFim = new Date(fim.getTime() + 62 * 86400000);
      for (const d of _ocorrencias(c, janelaIni, janelaFim)) {
        const ex = excecoes.get(`${c.id}|${d.getTime()}`);
        if (ex?.cancelada) continue;
        const it = _montar(c, d, ex);
        if (_dentro(new Date(it.inicio), it.fim ? new Date(it.fim) : null)) itens.push(it);
      }
    }
    for (const o of ro.rows) {
      itens.push({
        id: `os-${o.id}`, fonte: "os", tipo: "retorno", os_id: o.id,
        titulo: `Retorno pedido na ${o.numero}`, inicio: _spMeiaNoite(_isoDia(o.retorno_sugerido_em)).toISOString(),
        dia_inteiro: true, condominio_id: o.condominio_id, condominio_nome: o.condominio_nome, editavel: false,
        ..._feito(feitos.get(`retorno|${o.id}`)),
      });
    }
    for (const k of rk.rows) {
      itens.push({
        id: `ctr-${k.id}`, fonte: "contrato", tipo: "contrato", contrato_id: k.id,
        titulo: "Contrato termina", inicio: _spMeiaNoite(_isoDia(k.fim_em)).toISOString(),
        dia_inteiro: true, condominio_id: k.condominio_id, condominio_nome: k.condominio_nome, editavel: false,
        ..._feito(feitos.get(`contrato|${k.id}`)),
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
        // O dia proposto do lote (fase 2): o dia configurado, ou o próximo dia útil.
        const diaFat = (await lote.diaProposto(comp).catch(() => null))?.data
          || `${comp}-${String(Math.min(r.dia_faturamento || 1, 28)).padStart(2, "0")}`;
        if (_spMeiaNoite(diaFat) >= ini && _spMeiaNoite(diaFat) < fim) {
          itens.push({
            id: `fat-${comp}`, fonte: "omie", tipo: "faturamento", competencia: comp,
            titulo: r.faturados >= r.esperados
              ? `Contratos faturados: ${r.faturados} de ${r.esperados}`
              : `Conferir e faturar os contratos: ${r.faturados} de ${r.esperados}`,
            inicio: _spMeiaNoite(diaFat).toISOString(), dia_inteiro: true, so_admin: true, editavel: false,
            concluido: r.faturados >= r.esperados,
          });
        }
      }
    }

    itens.sort((a, b) => new Date(a.inicio) - new Date(b.inicio) || (b.dia_inteiro - a.dia_inteiro));
    const visitas_chamados = {};
    for (const v of rv.rows) visitas_chamados[v.chamado_id] = new Date(v.proxima).toISOString();
    res.json({ de, ate, itens, visitas_chamados });
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

// ── O lote do faturamento (Omie, fase 2; migration 097). Só o admin. ──────
// Nada aqui fatura sozinho: só o POST /confirmar chama o Omie, com a lista e
// o total que a tela mostrou. Ver src/services/omie-lote.service.js.
const _loteErro = (res, err, onde) => {
  if (err instanceof lote.LoteErro) return res.status(err.status).json({ error: err.message, contratos: err.contratos });
  console.error(`[agenda] lote ${onde}:`, err);
  res.status(500).json({ error: "Erro no lote do faturamento." });
};

// GET /agenda/faturamento/lote?competencia=AAAA-MM
router.get("/faturamento/lote", masterAdminOnly, painelNovoOnly, async (req, res) => {
  try { res.json(await lote.montar(String(req.query.competencia || lote.competenciaAtual()))); }
  catch (err) { _loteErro(res, err, "GET"); }
});

// POST /agenda/faturamento/lote/tirar { competencia, omie_contrato, tirar }
router.post("/faturamento/lote/tirar", masterAdminOnly, painelNovoOnly, async (req, res) => {
  const b = req.body || {};
  try { res.json(await lote.tirar(String(b.competencia || ""), b.omie_contrato, b.tirar !== false, req.user.id)); }
  catch (err) { _loteErro(res, err, "tirar"); }
});

// POST /agenda/faturamento/lote/confirmar { competencia, contratos: [...], valor_total }
// ⚠️ GRAVA NO OMIE. Responde 202 e o envio segue; a tela acompanha pelo GET.
router.post("/faturamento/lote/confirmar", masterAdminOnly, painelNovoOnly, async (req, res) => {
  const b = req.body || {};
  try { res.status(202).json(await lote.confirmar(String(b.competencia || ""), b.contratos, b.valor_total, req.user.id)); }
  catch (err) { _loteErro(res, err, "confirmar"); }
});

// POST /agenda/faturamento/lote/boleto { competencia, omie_contrato }
// ⚠️ GRAVA NO OMIE: gera o boleto do título que saiu sem boleto.
router.post("/faturamento/lote/boleto", masterAdminOnly, painelNovoOnly, async (req, res) => {
  const b = req.body || {};
  try { res.json(await lote.gerarBoleto(String(b.competencia || ""), b.omie_contrato, req.user.id)); }
  catch (err) { _loteErro(res, err, "boleto"); }
});

// POST /agenda/faturamento/lote/liberar { competencia, omie_contrato }
router.post("/faturamento/lote/liberar", masterAdminOnly, painelNovoOnly, async (req, res) => {
  const b = req.body || {};
  try { res.json(await lote.liberar(String(b.competencia || ""), b.omie_contrato, req.user.id)); }
  catch (err) { _loteErro(res, err, "liberar"); }
});

// POST /agenda/compromissos
router.post("/compromissos", async (req, res) => {
  const { erros, out } = _validar(req.body || {});
  if (erros.length) return res.status(400).json({ error: erros.join(" ") });
  // Pagamento é financeiro: nasce só para o admin, e só o admin cria.
  if (out.tipo === "pagamento" || out.tipo === "financeiro") out.so_admin = true;
  if (out.so_admin && !_ehAdmin(req)) return res.status(403).json({ error: "Só o admin lança compromisso financeiro." });
  // O operador só marca visita de chamado.
  if (_ehOperador(req) && (!out.chamado_id || out.tipo !== "visita")) return res.status(403).json({ error: "No turno, a agenda é só das visitas dos chamados." });
  try {
    const r = await pool.query(
      `INSERT INTO compromissos (titulo, tipo, inicio, fim, dia_inteiro, repeticao, repete_ate, condominio_id,
                                 responsavel_id, descricao, so_admin, criado_por, chamado_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [out.titulo, out.tipo, out.inicio, out.fim ?? null, out.dia_inteiro ?? false, out.repeticao,
       out.repete_ate ?? null, out.condominio_id ?? null, out.responsavel_id ?? null, out.descricao ?? null,
       out.so_admin ?? false, req.user.id, out.chamado_id ?? null]
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
  if (!c || (c.so_admin && !_ehAdmin(req)) || (_ehOperador(req) && !c.chamado_id)) {
    res.status(404).json({ error: "Compromisso não encontrado." }); return null;
  }
  return c;
}

// O operador não troca a visita de chamado em outra coisa.
function _validarMudanca(req, atual, out) {
  const tipoFinal = out.tipo || atual.tipo;
  if (tipoFinal === "pagamento" || tipoFinal === "financeiro") out.so_admin = true;
  if (out.so_admin && !_ehAdmin(req)) return "Só o admin lança compromisso financeiro.";
  if (_ehOperador(req) && ((out.tipo && out.tipo !== "visita") || ("chamado_id" in out && out.chamado_id !== atual.chamado_id) || "so_admin" in out)) {
    return "No turno, a agenda é só das visitas dos chamados.";
  }
  return null;
}

// ⚠️ A EXCEÇÃO É PRESA AO INÍCIO ORIGINAL DA VEZ (migration 111). Quando o
// início da série anda, as chaves andam junto — senão o "feito" de ontem
// se soltaria da visita. Anda certo quando a distância é a mesma para todas
// as vezes: compromisso que não repete, série semanal, ou só a hora mudou.
// Série mensal que troca de dia fica com as exceções antigas soltas (não
// aparecem mais), o que é aceitável: a série virou outra.
async function _andarExcecoes(db, deId, paraId, aPartirDe, delta, repeticao) {
  const anda = repeticao === "nenhuma" || repeticao === "semanal" || Math.abs(delta) < 86400000;
  await db.query(
    `UPDATE compromisso_ocorrencias
        SET compromisso_id = $2::int, ocorrencia_em = ocorrencia_em + ($3::text || ' milliseconds')::interval, atualizado_em = NOW()
      WHERE compromisso_id = $1::int AND ocorrencia_em >= $4::timestamptz`,
    [deId, paraId, String(anda ? delta : 0), aPartirDe]
  );
}

// PATCH /agenda/compromissos/:id — a série inteira ("todas").
router.patch("/compromissos/:id", async (req, res) => {
  try {
    const atual = await _carregar(req, res);
    if (!atual) return;
    const { erros, out } = _validar(req.body || {}, { parcial: true });
    if (erros.length) return res.status(400).json({ error: erros.join(" ") });
    const proibido = _validarMudanca(req, atual, out);
    if (proibido) return res.status(403).json({ error: proibido });
    const campos = Object.keys(out);
    if (!campos.length) return res.json(atual);
    const sets = campos.map((k, i) => `${k} = $${i + 2}`).join(", ");
    const r = await pool.query(
      `UPDATE compromissos SET ${sets}, atualizado_em = NOW() WHERE id = $1 RETURNING *`,
      [atual.id, ...campos.map(k => out[k])]
    );
    if (out.inicio && new Date(out.inicio).getTime() !== new Date(atual.inicio).getTime()) {
      const delta = new Date(out.inicio) - new Date(atual.inicio);
      await _andarExcecoes(pool, atual.id, atual.id, new Date(0).toISOString(), delta, r.rows[0].repeticao);
    }
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

// A "vez" pedida existe mesmo nesta série? (data/hora original exata)
function _ocorrenciaValida(c, iso) {
  const o = new Date(iso);
  if (!iso || isNaN(o)) return null;
  const achou = _ocorrencias(c, o, new Date(o.getTime() + 1)).some(d => d.getTime() === o.getTime());
  return achou ? o : null;
}

// POST /agenda/compromissos/:id/ocorrencia — "só esta" (migration 111).
// { ocorrencia, concluido?, cancelada?, inicio?, fim?, titulo?, descricao?, responsavel_id? }
// Também é por aqui que se marca feito, inclusive num compromisso que não repete.
router.post("/compromissos/:id/ocorrencia", async (req, res) => {
  try {
    const c = await _carregar(req, res);
    if (!c) return;
    const b = req.body || {};
    const o = _ocorrenciaValida(c, b.ocorrencia);
    if (!o) return res.status(400).json({ error: "Essa data não é uma das vezes deste compromisso." });
    const { erros, out } = _validar({
      inicio: b.inicio, fim: b.fim, titulo: b.titulo, descricao: b.descricao, responsavel_id: b.responsavel_id,
    }, { parcial: true });
    if (erros.length) return res.status(400).json({ error: erros.join(" ") });
    const ant = (await pool.query(
      `SELECT * FROM compromisso_ocorrencias WHERE compromisso_id = $1 AND ocorrencia_em = $2`, [c.id, o.toISOString()]
    )).rows[0] || {};
    // undefined = não mexe; null = volta a ser como a série.
    const pega = (k) => (k in out ? out[k] : (ant[k] ?? null));
    let concluidoEm = ant.concluido_em ?? null, concluidoPor = ant.concluido_por ?? null;
    if (b.concluido === true && !concluidoEm) { concluidoEm = new Date().toISOString(); concluidoPor = req.user.id; }
    if (b.concluido === false) { concluidoEm = null; concluidoPor = null; }
    const cancelada = b.cancelada !== undefined ? !!b.cancelada : !!ant.cancelada;
    const r = await pool.query(
      `INSERT INTO compromisso_ocorrencias
              (compromisso_id, ocorrencia_em, cancelada, inicio, fim, titulo, descricao, responsavel_id, concluido_em, concluido_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (compromisso_id, ocorrencia_em) DO UPDATE SET
              cancelada = EXCLUDED.cancelada, inicio = EXCLUDED.inicio, fim = EXCLUDED.fim, titulo = EXCLUDED.titulo,
              descricao = EXCLUDED.descricao, responsavel_id = EXCLUDED.responsavel_id,
              concluido_em = EXCLUDED.concluido_em, concluido_por = EXCLUDED.concluido_por, atualizado_em = NOW()
       RETURNING *`,
      [c.id, o.toISOString(), cancelada, pega("inicio"), pega("fim"), pega("titulo"), pega("descricao"),
       pega("responsavel_id"), concluidoEm, concluidoPor]
    );
    res.json(r.rows[0]);
  } catch (err) {
    console.error("[agenda] POST /ocorrencia:", err);
    res.status(500).json({ error: "Erro ao salvar esta vez do compromisso." });
  }
});

// POST /agenda/compromissos/:id/dividir — "esta e as próximas".
// { ocorrencia, apagar?, ...campos do PATCH }
// A série velha termina na véspera; nasce outra a partir desta vez, com as
// mudanças. As exceções daqui para frente vão junto. Se a vez é a primeira,
// é o mesmo que mexer na série toda.
router.post("/compromissos/:id/dividir", async (req, res) => {
  const db = await pool.connect();
  try {
    const c = await _carregar(req, res);
    if (!c) return;
    const b = req.body || {};
    const o = _ocorrenciaValida(c, b.ocorrencia);
    if (!o) return res.status(400).json({ error: "Essa data não é uma das vezes deste compromisso." });
    const campos = { ...b }; delete campos.ocorrencia; delete campos.apagar;
    const { erros, out } = _validar(campos, { parcial: true });
    if (erros.length) return res.status(400).json({ error: erros.join(" ") });
    const proibido = _validarMudanca(req, c, out);
    if (proibido) return res.status(403).json({ error: proibido });
    const primeira = o.getTime() === new Date(c.inicio).getTime();
    const vespera = _spDia(new Date(o.getTime() - 86400000));

    await db.query("BEGIN");
    if (b.apagar) {
      if (primeira) await db.query(`UPDATE compromissos SET apagado_em = NOW() WHERE id = $1`, [c.id]);
      else await db.query(`UPDATE compromissos SET repete_ate = $2::date, atualizado_em = NOW() WHERE id = $1`, [c.id, vespera]);
      await db.query("COMMIT");
      return res.json({ ok: true, apagado_desde: o.toISOString() });
    }
    const dur = c.fim ? new Date(c.fim) - new Date(c.inicio) : 0;
    const novo = {
      titulo: c.titulo, tipo: c.tipo, inicio: o.toISOString(), fim: c.fim ? new Date(o.getTime() + dur).toISOString() : null,
      dia_inteiro: c.dia_inteiro, repeticao: c.repeticao, repete_ate: c.repete_ate ? _isoDia(c.repete_ate) : null,
      condominio_id: c.condominio_id, responsavel_id: c.responsavel_id, descricao: c.descricao,
      so_admin: c.so_admin, chamado_id: c.chamado_id, ...out,
    };
    let r;
    if (primeira) {
      const ks = Object.keys(out);
      r = ks.length
        ? await db.query(`UPDATE compromissos SET ${ks.map((k, i) => `${k} = $${i + 2}`).join(", ")}, atualizado_em = NOW() WHERE id = $1 RETURNING *`,
            [c.id, ...ks.map(k => out[k])])
        : { rows: [c] };
      if (out.inicio) await _andarExcecoes(db, c.id, c.id, new Date(0).toISOString(), new Date(out.inicio) - o, r.rows[0].repeticao);
    } else {
      await db.query(`UPDATE compromissos SET repete_ate = $2::date, atualizado_em = NOW() WHERE id = $1`, [c.id, vespera]);
      r = await db.query(
        `INSERT INTO compromissos (titulo, tipo, inicio, fim, dia_inteiro, repeticao, repete_ate, condominio_id,
                                   responsavel_id, descricao, so_admin, criado_por, chamado_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [novo.titulo, novo.tipo, novo.inicio, novo.fim, novo.dia_inteiro, novo.repeticao, novo.repete_ate,
         novo.condominio_id, novo.responsavel_id, novo.descricao, novo.so_admin, req.user.id, novo.chamado_id]
      );
      await _andarExcecoes(db, c.id, r.rows[0].id, o.toISOString(), new Date(novo.inicio) - o, novo.repeticao);
    }
    await db.query("COMMIT");
    res.json(r.rows[0]);
  } catch (err) {
    await db.query("ROLLBACK").catch(() => {});
    console.error("[agenda] POST /dividir:", err);
    res.status(500).json({ error: "Erro ao salvar daqui para frente." });
  } finally {
    db.release();
  }
});

// POST /agenda/feitos { fonte: 'retorno'|'contrato', ref_id, concluido }
// O feito do que a agenda lê de outras tabelas (migration 111).
router.post("/feitos", async (req, res) => {
  const b = req.body || {};
  const fonte = b.fonte, ref = Number(b.ref_id);
  if (!["retorno", "contrato"].includes(fonte) || !Number.isInteger(ref) || ref <= 0) return res.status(400).json({ error: "fonte ou ref_id inválido." });
  if (_ehOperador(req) && fonte !== "retorno") return res.status(403).json({ error: "No turno, a agenda é só das visitas dos chamados." });
  try {
    if (b.concluido === false) {
      await pool.query(`DELETE FROM agenda_feitos WHERE fonte = $1 AND ref_id = $2`, [fonte, ref]);
      return res.json({ ok: true, concluido: false });
    }
    const r = await pool.query(
      `INSERT INTO agenda_feitos (fonte, ref_id, concluido_por) VALUES ($1, $2, $3)
       ON CONFLICT (fonte, ref_id) DO NOTHING RETURNING *`,
      [fonte, ref, req.user.id]
    );
    res.json({ ok: true, concluido: true, ...(r.rows[0] || {}) });
  } catch (err) {
    console.error("[agenda] POST /feitos:", err);
    res.status(500).json({ error: "Erro ao marcar como feito." });
  }
});

module.exports = router;
module.exports._ocorrencias = _ocorrencias; // para o teste
