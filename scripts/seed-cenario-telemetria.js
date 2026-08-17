// Dá variedade à telemetria do condomínio DEMO no banco de TESTE.
//
// Problema que ele resolve: o seed original deixa os 4 reservatórios com o
// mesmo `last_seen` antigo, então TODOS aparecem offline e a tela vira uma
// coluna de cards idênticos — não dá pra avaliar layout, alerta nem gráfico.
//
// Depois de rodar, cada reservatório conta uma história diferente:
//
//   Caixa Superior 1  (DEMO-SUP1)  online · cheia (~88%) · sem alerta
//   Caixa Superior 2  (DEMO-SUP2)  online · nível baixo (~34%) · bomba enchendo
//   Cisterna          (DEMO-CIST)  online · crítico (~8%) · alerta muito baixo
//   Reserva Incêndio  (DEMO-INCE)  OFFLINE há 3h · última leitura ~71%
//
// Uso:  node scripts/seed-cenario-telemetria.js
//
// Recusa rodar em produção (mesmo resolvedor do servidor, src/db-url.js).
// É idempotente: apaga as leituras dos devices DEMO-* e regrava as 72h.
//
// ⚠️ Com `node server.js` no ar, o offline.job marca como offline quem passar
//    de OFFLINE_MINUTES (default 10) sem leitura — os três "online" viram
//    offline ~10 min depois. É só rodar o script de novo antes de demonstrar,
//    ou subir o servidor com OFFLINE_MINUTES alto (ex.: OFFLINE_MINUTES=1440).

require("dotenv").config();

const { Pool } = require("pg");
const { resolverDatabaseUrl, descreverAlvo } = require("../src/db-url");

const HORAS = 72;          // janela de histórico gerada
const PASSO_MIN = 10;      // intervalo entre leituras (= TELEMETRIA_HEARTBEAT_MIN)

// Mesmas faixas de src/routes/telemetria.routes.js — o cenário precisa cair
// nas mesmas fronteiras que o backend usaria pra decidir o alerta.
const nivelFromPct = (pct) => {
  if (pct >= 70) return "alto";
  if (pct >= 45) return "medio";
  if (pct >= 20) return "baixo";
  return "muito_baixo";
};

// PRNG determinístico: o mesmo comando gera sempre o mesmo gráfico, então
// "mudou alguma coisa na tela?" é uma pergunta respondível.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// Cada cenário é uma função de `t` (horas desde o início da janela, 0..72)
// para { pct, bomba }. Piecewise explícito em vez de simulação: o valor final
// é previsível, que é o ponto de um dado de demonstração.
const CENARIOS = {
  // Caixa cheia e saudável: dente de serra de 8h — enche em 1h, consome em 7h.
  // O deslocamento (+3) faz a janela terminar no meio do consumo, com a caixa
  // alta e a bomba desligada.
  "DEMO-SUP1": {
    reservatorio: "Caixa Superior 1",
    resumo: "cheia, ciclo normal de consumo",
    ateHoras: HORAS,
    alerta: null,
    curva(t) {
      const c = (t + 3) % 8;
      return c < 1
        ? { pct: 78 + 14 * c, bomba: true }
        : { pct: 92 - 2 * (c - 1), bomba: false };
    },
  },

  // Consumo alto derruba a caixa ao longo do último dia; a bomba entra nas
  // duas horas finais e a recuperação ainda não tirou do "baixo".
  "DEMO-SUP2": {
    reservatorio: "Caixa Superior 2",
    resumo: "nível baixo, bomba enchendo",
    ateHoras: HORAS,
    alerta: { tipo: "nivel_baixo", horasAtras: 5 },
    curva(t) {
      if (t < 48) {
        const c = t % 6;
        return c < 1
          ? { pct: 55 + 10 * c, bomba: true }
          : { pct: 65 - 2 * (c - 1), bomba: false };
      }
      if (t < 70) return { pct: 60 - (t - 48) * (30 / 22), bomba: false };
      return { pct: 30 + (t - 70) * 2, bomba: true };
    },
  },

  // Cisterna esvaziando sem a bomba responder: a curva cai por 36h e não sobe.
  // É o cenário que precisa existir pra ver o card crítico e o alerta P2.
  "DEMO-CIST": {
    reservatorio: "Cisterna",
    resumo: "crítico, praticamente sem água",
    ateHoras: HORAS,
    alerta: { tipo: "nivel_muito_baixo", horasAtras: 9 },
    curva(t) {
      if (t < 36) return { pct: 60 - t * (5 / 36), bomba: false };
      return { pct: 55 - (t - 36) * (47 / 36), bomba: false };
    },
  },

  // Reserva de incêndio: nível normal, mas o device parou de falar há 3h.
  // `ateHoras` corta a série antes do fim da janela — é isso que produz o
  // offline de verdade (last_seen velho), não um flag.
  "DEMO-INCE": {
    reservatorio: "Reserva Incêndio",
    resumo: "OFFLINE há 3h",
    ateHoras: HORAS - 3,
    alerta: { tipo: "dispositivo_offline", horasAtras: 3 },
    curva(t) {
      const c = t % 12;
      return { pct: c < 1 ? 68 + 8 * c : 76 - (c - 1) * (8 / 11), bomba: c < 1 };
    },
  },
};

const MENSAGEM_ALERTA = {
  nivel_baixo: (r, pct) => `${r} chegou a ${pct}%`,
  nivel_muito_baixo: (r, pct) => `${r} em ${pct}% — abaixo do limite de segurança`,
  dispositivo_offline: (r, _pct, min) => `${r} (caixa) está OFFLINE há ${min} minutos`,
};

async function main() {
  const { url, alvo } = resolverDatabaseUrl();
  if (alvo === "PRODUÇÃO") {
    console.error("✗ ABORTADO: o alvo resolvido é PRODUÇÃO.");
    console.error("  Este script só roda no banco de teste (DATABASE_URL_TESTE + NODE_ENV != production).");
    process.exit(1);
  }
  if (!url) {
    console.error("✗ Nenhum banco resolvido — confira DATABASE_URL_TESTE no .env");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  console.log(`→ Cenário de telemetria em ${alvo} — ${descreverAlvo(url)}\n`);

  const agora = Date.now();
  const inicio = agora - HORAS * 3600_000;
  const resumo = [];

  try {
    const devices = Object.keys(CENARIOS);

    const existentes = await pool.query(
      "SELECT device_id, nome FROM reservatorios WHERE device_id = ANY($1)",
      [devices]
    );
    if (existentes.rowCount === 0) {
      console.error("✗ Nenhum reservatório DEMO-* encontrado. Rode antes: node scripts/seed-teste.js");
      process.exit(1);
    }

    for (const device_id of devices) {
      const cen = CENARIOS[device_id];
      const rand = mulberry32(
        [...device_id].reduce((a, c) => a + c.charCodeAt(0), 0)
      );

      // ── Série de leituras ───────────────────────────────────────────────
      const criados = [], niveis = [], pcts = [], bombas = [], adcs = [], rms = [];
      let ultimo = null;

      for (let min = 0; min <= cen.ateHoras * 60; min += PASSO_MIN) {
        const t = min / 60;
        const bruto = cen.curva(t);
        // ±0,8 pp de ruído: sem isso a linha fica sintética demais e esconde
        // o quanto o gráfico aguenta de oscilação real do ADC.
        const pct = Math.round(clamp(bruto.pct + (rand() - 0.5) * 1.6, 0, 100));
        const ts = new Date(inicio + min * 60_000);

        criados.push(ts);
        pcts.push(pct);
        niveis.push(nivelFromPct(pct));
        bombas.push(bruto.bomba);
        adcs.push(650 + Math.round(pct * 31.5));               // 4-20mA plausível
        rms.push(bruto.bomba ? 400 + Math.round(rand() * 60) : Math.round(rand() * 8));

        ultimo = { ts, pct, bomba: bruto.bomba };
      }

      await pool.query("DELETE FROM leituras WHERE device_id = $1", [device_id]);
      await pool.query(
        `INSERT INTO leituras (device_id, nivel, nivel_pct, bomba_ligada, adc_raw, bomba_rms, criado_em)
         SELECT $1, n, p, b, a, r, c
         FROM UNNEST($2::text[], $3::smallint[], $4::boolean[], $5::int[], $6::int[], $7::timestamptz[])
              AS t(n, p, b, a, r, c)`,
        [device_id, niveis, pcts, bombas, adcs, rms, criados]
      );

      // ── last_seen ───────────────────────────────────────────────────────
      // É daqui que sai o offline: o backend compara last_seen com
      // OFFLINE_MINUTES, não existe coluna de status.
      await pool.query("UPDATE reservatorios SET last_seen = $2 WHERE device_id = $1",
        [device_id, ultimo.ts]);

      // ── Alertas ─────────────────────────────────────────────────────────
      // Resolve tudo que estava aberto antes de abrir o alvo: o índice parcial
      // uniq_alerta_aberto só permite um aberto por (device, tipo), e alerta
      // velho de outro tipo é justamente o que polui a tela hoje.
      const fechados = await pool.query(
        "UPDATE alertas SET status = 'resolvido', atualizado_em = NOW() WHERE device_id = $1 AND status = 'aberto'",
        [device_id]
      );

      if (cen.alerta) {
        const criadoEm = new Date(agora - cen.alerta.horasAtras * 3600_000);
        const msg = MENSAGEM_ALERTA[cen.alerta.tipo](
          cen.reservatorio, ultimo.pct, cen.alerta.horasAtras * 60
        );
        await pool.query(
          `INSERT INTO alertas (device_id, tipo, mensagem, status, criado_em, atualizado_em)
           VALUES ($1, $2, $3, 'aberto', $4, NOW())`,
          [device_id, cen.alerta.tipo, msg, criadoEm]
        );
      }

      resumo.push({
        device: device_id,
        reservatorio: cen.reservatorio,
        cenario: cen.resumo,
        pct: ultimo.pct,
        nivel: nivelFromPct(ultimo.pct),
        bomba: ultimo.bomba ? "ligada" : "desligada",
        leituras: criados.length,
        alerta: cen.alerta ? cen.alerta.tipo : "—",
        resolvidos: fechados.rowCount,
      });
    }

    console.table(resumo);
    console.log(`\n✓ ${HORAS}h de histórico regravadas (1 leitura / ${PASSO_MIN} min).`);
    console.log("  Login do cliente: demo-cliente@teste.local  (condomínio DEMO Residencial Aurora)");
    console.log("  Rode de novo se o offline.job derrubar os três online.\n");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("✗ Falhou:", e.message);
  process.exit(1);
});
