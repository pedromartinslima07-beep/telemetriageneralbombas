const rateLimit = require("express-rate-limit");
const express = require("express");
const { pool } = require("../db");
const { upsertAlertaAberto } = require("../services/alertas.service");
const { sendAlertaEmail } = require("../services/email");
const { abrirChamadoAuto } = require("../services/chamados.service");
const { avaliarExtravasor, alturaAguaM } = require("../services/extravasor.service");
const { getConfigInt } = require("../services/config.service");

const router = express.Router();

const telemetriaLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 120,            // 120 req/min por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas requisições. Reduza a frequência da telemetria." },
});

// Deriva nivel (string) a partir de nivel_pct (0-100)
const nivelFromPct = (pct) => {
  if (pct >= 70) return "alto";
  if (pct >= 45) return "medio";
  if (pct >= 20) return "baixo";
  return "muito_baixo";
};

// Gravidade crescente — usada pra decidir se uma leitura piorou ou melhorou.
const NIVEL_ORDEM = { muito_baixo: 0, baixo: 1, medio: 2, alto: 3 };

// Margem (em pontos percentuais) exigida pra o nível MELHORAR de faixa.
// Dimensionada em ~3x o desvio medido do ADC no device de teste (±1,7% de
// nível): sem ela, um nível parado em cima de uma fronteira gera dezenas de
// travessias, porque os alertas são reprocessados a cada leitura (10s) e o
// ruído joga cada amostra pra um lado. Medido em 05/08: uma única descida de
// 37% a 0% criou 17 alertas onde deveriam ser 2.
const HISTERESE_PCT = Number(process.env.TELEMETRIA_HISTERESE_PCT ?? 5);

// Aplica histerese: PIORAR vale na fronteira nua (alerta cedo, sem atraso),
// MELHORAR exige HISTERESE_PCT de folga. `nivelAtual` é o nível que os alertas
// abertos do device dizem estar valendo — não o da última leitura gravada,
// que o write-threshold pode ter descartado.
const nivelComHisterese = (pct, nivelAtual) => {
  const cru = nivelFromPct(pct);
  if (!nivelAtual || cru === nivelAtual) return cru;
  if (NIVEL_ORDEM[cru] < NIVEL_ORDEM[nivelAtual]) return cru; // piorou: aceita já
  // Melhorou: só confirma se ainda estaria na faixa nova descontando a margem.
  return nivelFromPct(pct - HISTERESE_PCT) === cru ? cru : nivelAtual;
};

// Calcula nivel_pct a partir do valor ADC bruto + calibração do reservatório
const calcularNivelPct = (adcRaw, calibracao) => {
  const { adc_zero, adc_por_metro, altura_total_m } = calibracao;
  const alturaAgua = (adcRaw - adc_zero) / adc_por_metro;
  const pct = (alturaAgua / altura_total_m) * 100;
  return Math.round(Math.min(100, Math.max(0, pct)));
};

router.post("/", telemetriaLimiter, async (req, res) => {
  const {
    device_id,
    adc_raw: adcRawInput,
    bomba_rms: bombaRmsInput,
    bomba_ligada: bombaLigadaInput,
  } = req.body;

  // ── device_id ──
  if (typeof device_id !== "string" || device_id.trim().length < 3) {
    return res.status(400).json({ error: "device_id inválido" });
  }

  // ── adc_raw ──
  const adcRaw = Number(adcRawInput);
  if (!Number.isInteger(adcRaw) || adcRaw < 0) {
    return res.status(400).json({ error: "adc_raw deve ser inteiro >= 0" });
  }

  // ── bomba_rms (opcional) — quando vier, o servidor decide bomba_ligada
  //    comparando com reservatorio.limiar_bomba.
  //    Para compatibilidade, ainda aceita bomba_ligada direto. ──
  let bombaRms = null;
  if (bombaRmsInput != null) {
    bombaRms = Number(bombaRmsInput);
    if (!Number.isInteger(bombaRms) || bombaRms < 0) {
      return res.status(400).json({ error: "bomba_rms deve ser inteiro >= 0" });
    }
  } else if (typeof bombaLigadaInput !== "boolean") {
    return res.status(400).json({ error: "informe bomba_rms (recomendado) ou bomba_ligada (boolean)" });
  }

  // ── chave do device ──
  const deviceKeyHeader = req.headers["x-device-key"];
  if (!deviceKeyHeader) {
    return res.status(401).json({ error: "Chave do dispositivo ausente (X-Device-Key)" });
  }

  try {
    // 1 query: reservatório + última leitura (substitui 2 round-trips)
    // Inclui nome do reservatório + condomínio pra email de alerta sem query extra.
    const rRes = await pool.query(
      `SELECT r.id, r.condominio_id, r.device_id, r.device_key,
              r.nome AS reservatorio_nome,
              r.altura_total_m, r.adc_zero, r.adc_por_metro,
              r.limiar_bomba,
              -- Extravasamento (migration 106). last_seen é lido ANTES do
              -- UPDATE abaixo: é ele que diz se houve buraco nas leituras.
              r.altura_extravasor_m, r.extravasor_desde, r.extravasor_bomba_desde,
              r.last_seen,
              EXISTS (SELECT 1 FROM alertas ax
                       WHERE ax.device_id = r.device_id AND ax.status = 'aberto'
                         AND ax.tipo = 'extravasamento') AS extravasamento_aberto,
              COALESCE(NULLIF(c.nome_fantasia,''), c.nome) AS condominio_nome,
              -- last_nivel_pct/bomba_ligada/criado_em alimentam só o
              -- write-threshold. O nível da última leitura NÃO serve pra
              -- decidir alerta (ver abaixo) e por isso não é mais buscado.
              ul.nivel_pct    AS last_nivel_pct,
              ul.bomba_ligada AS last_bomba_ligada,
              ul.criado_em    AS last_criado_em,
              -- Fonte de verdade do nível que já foi notificado. Vem dos
              -- alertas abertos, não da última leitura: o write-threshold
              -- descarta a maioria das leituras, então o nível gravado fica
              -- velho e os dois tipos de alerta ficavam abertos juntos.
              (SELECT array_agg(al.tipo)
                 FROM alertas al
                WHERE al.device_id = r.device_id
                  AND al.status = 'aberto'
                  AND al.tipo IN ('nivel_baixo', 'nivel_muito_baixo')
              ) AS alertas_nivel_abertos
       FROM reservatorios r
       LEFT JOIN condominios c ON c.id = r.condominio_id
       LEFT JOIN LATERAL (
         SELECT nivel, nivel_pct, bomba_ligada, criado_em
         FROM leituras
         WHERE device_id = r.device_id
         ORDER BY criado_em DESC
         LIMIT 1
       ) ul ON true
       WHERE r.device_id = $1
       LIMIT 1`,
      [device_id]
    );

    if (rRes.rows.length === 0) {
      return res.status(403).json({ error: "Dispositivo não autorizado" });
    }

    const reservatorio = rRes.rows[0];

    if (
      !reservatorio.device_key ||
      String(reservatorio.device_key) !== String(deviceKeyHeader)
    ) {
      return res.status(403).json({ error: "Chave do dispositivo inválida" });
    }

    // ── Calibração ──
    if (!reservatorio.altura_total_m || !reservatorio.adc_zero || !reservatorio.adc_por_metro) {
      return res.status(422).json({
        error: "Reservatório sem calibração configurada. Configure altura_total_m, adc_zero e adc_por_metro no painel admin.",
      });
    }

    const nivelPct = calcularNivelPct(adcRaw, reservatorio);
    // Gravado cru em `leituras` — dado é dado, o histórico não leva histerese.
    const nivelNormalizado = nivelFromPct(nivelPct);

    // Nível que os alertas abertos dizem estar valendo. Se os dois tipos
    // estiverem abertos (estado inconsistente deixado pelo bug antigo), assume
    // o pior e o bloco de alertas abaixo resolve o outro — auto-cura.
    const tiposAbertos = reservatorio.alertas_nivel_abertos || [];
    const nivelAlertado = tiposAbertos.includes("nivel_muito_baixo") ? "muito_baixo"
                        : tiposAbertos.includes("nivel_baixo")       ? "baixo"
                        : null;
    // Nível que governa os ALERTAS (com histerese) — pode diferir do cru.
    const nivelAlerta = nivelComHisterese(nivelPct, nivelAlertado);

    // ── Decide bomba_ligada ──
    // Se o ESP32 enviou bomba_rms, compara com limiar_bomba do reservatório.
    // Caso o limiar não esteja configurado, fica null (UI mostra "-").
    // Se veio bomba_ligada direto (compatibilidade), usa esse.
    let bombaLigada;
    if (bombaRms != null) {
      bombaLigada = reservatorio.limiar_bomba != null
        ? bombaRms > reservatorio.limiar_bomba
        : null;
    } else {
      bombaLigada = bombaLigadaInput;
    }

    // ── Threshold: só grava leitura se nivel_pct mudou ≥ X%, passou ≥ N min,
    //    ou o estado da bomba mudou ──
    const pctThreshold = Number(process.env.TELEMETRIA_PCT_THRESHOLD ?? 5);
    const heartbeatMin = Number(process.env.TELEMETRIA_HEARTBEAT_MIN ?? 10);

    let deveGravar = true;
    if (reservatorio.last_criado_em != null) {
      const diffPct = Math.abs(nivelPct - (reservatorio.last_nivel_pct ?? 0));
      const minutosSemGravar = (Date.now() - new Date(reservatorio.last_criado_em).getTime()) / 60000;
      const bombaEstadoMudou = bombaLigada !== reservatorio.last_bomba_ligada;
      deveGravar = diffPct >= pctThreshold || minutosSemGravar >= heartbeatMin || bombaEstadoMudou;
    }

    // CTE única: INSERT (condicional) + UPDATE last_seen + resolve alerta offline
    if (deveGravar) {
      await pool.query(
        `WITH ins AS (
           INSERT INTO leituras (device_id, nivel, bomba_ligada, nivel_pct, adc_raw, bomba_rms)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING device_id
         ),
         upd_res AS (
           UPDATE reservatorios SET last_seen = NOW() WHERE device_id = $1 RETURNING device_id
         )
         UPDATE alertas SET status = 'resolvido'
         WHERE device_id = $1 AND tipo = 'dispositivo_offline' AND status = 'aberto'`,
        [device_id, nivelNormalizado, bombaLigada, nivelPct, adcRaw, bombaRms]
      );
    } else {
      await pool.query(
        `WITH upd_res AS (
           UPDATE reservatorios SET last_seen = NOW() WHERE device_id = $1 RETURNING device_id
         )
         UPDATE alertas SET status = 'resolvido'
         WHERE device_id = $1 AND tipo = 'dispositivo_offline' AND status = 'aberto'`,
        [device_id]
      );
    }

    // ── Alertas de nível ──
    // O tipo de alerta que DEVE estar aberto agora (no máximo um). Tudo que
    // não for ele é resolvido — inclusive quando nada mudou, porque é
    // justamente aí que os dois tipos ficavam abertos juntos: o `if
    // (nivelMudou)` de antes comparava com a última leitura GRAVADA, e o
    // write-threshold descarta a maioria delas.
    const tipoAlertaAlvo = nivelAlerta === "baixo"       ? "nivel_baixo"
                         : nivelAlerta === "muito_baixo" ? "nivel_muito_baixo"
                         : null;

    const tiposParaResolver = ["nivel_baixo", "nivel_muito_baixo"]
      .filter((t) => t !== tipoAlertaAlvo);

    if (tiposParaResolver.some((t) => tiposAbertos.includes(t))) {
      await pool.query(
        `UPDATE alertas SET status = 'resolvido'
          WHERE device_id = $1 AND tipo = ANY($2::text[]) AND status = 'aberto'`,
        [device_id, tiposParaResolver]
      );
    }

    // Dispara email + chamado automático só quando o alerta é NOVO (inserted) —
    // evita spam a cada leitura enquanto o nível continua baixo. updated =
    // atualizou mensagem do existente. abrirChamadoAuto já cuida da dedup por
    // condomínio+categoria e escalona a prioridade se baixo virar muito_baixo
    // com o chamado ainda aberto.
    const _notificarSeNovo = (resultado, tipo, mensagem, prioridade, categoria = "nivel_baixo") => {
      if (resultado?.action !== "inserted") return;
      sendAlertaEmail({
        tipo,
        mensagem,
        reservatorio_nome: reservatorio.reservatorio_nome,
        condominio_nome: reservatorio.condominio_nome,
        device_id,
        nivel_pct: nivelPct,
      }).catch(() => {}); // já loga internamente, não bloqueia a resposta

      abrirChamadoAuto({
        condominio_id: reservatorio.condominio_id,
        titulo: `[AUTO] ${mensagem}`,
        descricao: `Alerta automático de telemetria — ${mensagem} (reservatório ${reservatorio.reservatorio_nome}, ${nivelPct}%).`,
        prioridade,
        categoria,
      }).catch((e) => console.error("[telemetria] erro ao abrir chamado automático:", e.message));
    };

    if (tipoAlertaAlvo === "nivel_baixo") {
      const msg = `Nível baixo detectado no dispositivo ${device_id}`;
      const r = await upsertAlertaAberto(device_id, "nivel_baixo", msg);
      _notificarSeNovo(r, "nivel_baixo", msg, "p3");
    } else if (tipoAlertaAlvo === "nivel_muito_baixo") {
      const msg = `NÍVEL MUITO BAIXO detectado no dispositivo ${device_id}`;
      const r = await upsertAlertaAberto(device_id, "nivel_muito_baixo", msg);
      _notificarSeNovo(r, "nivel_muito_baixo", msg, "p2");
    }

    // ── Extravasamento (migration 106) ──
    // A regra mora em extravasor.service.js; aqui só o banco. Reservatório sem
    // `altura_extravasor_m` sai com tudo null e fecha um alerta que tenha
    // ficado aberto (ladrão apagado do cadastro).
    const extCfg = {
      minutos:      await getConfigInt("telemetria.extravasor_minutos", 10),
      bombaMinutos: await getConfigInt("telemetria.extravasor_bomba_minutos", 3),
      toleranciaCm: await getConfigInt("telemetria.extravasor_tolerancia_cm", 2),
      histereseCm:  await getConfigInt("telemetria.extravasor_histerese_cm", 3),
    };
    const ext = avaliarExtravasor({
      alturaAgua:  alturaAguaM(adcRaw, reservatorio),
      ladrao:      reservatorio.altura_extravasor_m,
      bombaLigada,
      desde:       reservatorio.extravasor_desde,
      bombaDesde:  reservatorio.extravasor_bomba_desde,
      lastSeen:    reservatorio.last_seen,
      agora:       new Date(),
      cfg:         extCfg,
    });

    // Só escreve quando o relógio muda de estado (liga/desliga), não a cada 10s.
    const _ts = (x) => (x ? new Date(x).getTime() : null);
    if (_ts(ext.desde) !== _ts(reservatorio.extravasor_desde)
        || _ts(ext.bombaDesde) !== _ts(reservatorio.extravasor_bomba_desde)) {
      await pool.query(
        `UPDATE reservatorios
            SET extravasor_desde = $2::timestamptz, extravasor_bomba_desde = $3::timestamptz
          WHERE device_id = $1`,
        [device_id, ext.desde, ext.bombaDesde]
      );
    }

    if (ext.disparo) {
      const comBomba = ext.disparo === "bomba";
      const msg = comBomba
        ? `EXTRAVASAMENTO: nível no ladrão com a bomba ligada no dispositivo ${device_id}`
        : `Extravasamento: nível no ladrão no dispositivo ${device_id}`;
      const r = await upsertAlertaAberto(device_id, "extravasamento", msg);
      // Categoria "vazamento" (água saindo do sistema) — não cria categoria nova
      // porque ela é a régua contratual de prioridade (prioridade.service.js).
      // Com a bomba ligada é P2 (a régua de vazamento); só pelo nível, P3,
      // porque a sonda pode estar enganada. Se a bomba ligar depois do alerta
      // aberto, abrirChamadoAuto só sobe a prioridade de um chamado em aberto.
      if (r.action === "inserted") _notificarSeNovo(r, "extravasamento", msg, comBomba ? "p2" : "p3", "vazamento");
      else if (comBomba && (Date.now() - ext.bombaDesde) / 60000 < extCfg.bombaMinutos + 1) {
        // Só no primeiro minuto depois de a regra da bomba vencer — senão seria
        // uma consulta de chamado a cada leitura (10s) enquanto extravasa.
        abrirChamadoAuto({
          condominio_id: reservatorio.condominio_id,
          titulo: `[AUTO] ${msg}`,
          descricao: `Alerta automático de telemetria — ${msg} (reservatório ${reservatorio.reservatorio_nome}).`,
          prioridade: "p2",
          categoria: "vazamento",
        }).catch((e) => console.error("[telemetria] erro ao escalar chamado de extravasamento:", e.message));
      }
    } else if (!ext.noLadrao && reservatorio.extravasamento_aberto) {
      // Fecha só quando o nível SAIU do ladrão. Ainda no ladrão mas antes do
      // prazo (relógio reiniciado por lacuna) o alerta aberto fica como está.
      await pool.query(
        `UPDATE alertas SET status = 'resolvido'
          WHERE device_id = $1 AND tipo = 'extravasamento' AND status = 'aberto'`,
        [device_id]
      );
    }

    return res.json({
      status: "Dados salvos com sucesso",
      gravado: deveGravar,
      nivel_pct: nivelPct,
      nivel: nivelNormalizado,
      nivel_alerta: nivelAlerta, // com histerese — pode diferir de `nivel`
    });
  } catch (error) {
    console.error("Erro no /telemetria:", error);
    return res.status(500).json({ error: "Erro ao salvar no banco" });
  }
});

module.exports = { telemetriaRouter: router };
