// Painel do operador (`/operador/painel`) — a fila do turno.
//
// UMA request monta a tela inteira. O painel admin compõe a mesma informação
// a partir de cinco endpoints e junta no browser; aqui não dá: a ordenação é
// o SLA restante, e ela precisa ser calculada com o relógio do SERVIDOR. O
// relógio do navegador do operador pode estar minutos fora, e um turno
// ordenado por "o que estoura primeiro" não pode depender disso.
//
// Fluxo do módulo: docs/modulos/painel-operador.md

const express = require("express");
const { pool } = require("../db");
const { authRequired } = require("../middleware/authRequired");
const { adminOnly } = require("../middleware/adminOnly");

const router = express.Router();

// Faixas de nível — as MESMAS do resto do sistema (telemetria.md).
// Duplicadas aqui de propósito: o front do operador não carrega admin.js.
const NIVEL_BAIXO = 45;
const NIVEL_CRITICO = 20;

// Minutos sem leitura a partir dos quais o reservatório é considerado mudo.
// Mesmo valor de `OFFLINE_MINUTES` em src/config.js — importado de lá para
// não virar um segundo número de verdade.
const { OFFLINE_MINUTES } = require("../config");

/**
 * GET /operador/fila
 *
 * Devolve os chamados abertos com o SLA já resolvido, os reservatórios do
 * condomínio de cada um (quando existem) e a equipe com posição atual.
 *
 * ⚠️ A ORDENAÇÃO É O SLA RESTANTE, não a prioridade. Um P3 com 20 minutos de
 * prazo vem antes de um P2 recém-aberto — é assim que quem está de turno
 * trabalha, e é o que separa esta tela da lista de chamados do admin, que
 * ordena por data.
 */
router.get("/fila", authRequired, adminOnly, async (req, res) => {
  try {
    const [chamadosRes, reservRes, tecnicosRes] = await Promise.all([
      pool.query(`
        WITH base AS (
          SELECT
            ch.id, ch.titulo, ch.descricao, ch.categoria, ch.prioridade,
            ch.status, ch.criado_em, ch.conversa_id, ch.plano_manutencao_id,
            ch.primeira_resposta_em, ch.tecnico_a_caminho_em, ch.tecnico_chegou_em,
            ch.condominio_id,
            c.nome, c.nome_fantasia, c.bairro, c.cidade, c.lat, c.lng,
            t.id AS tecnico_id, t.nome AS tecnico_nome,
            sd.ttfr_min, sd.ttr_min, sd.sla_chegada_min,
            ROUND(EXTRACT(EPOCH FROM (NOW() - ch.criado_em)) / 60.0)::int AS minutos_abertos
          FROM chamados ch
          LEFT JOIN condominios    c  ON c.id  = ch.condominio_id
          LEFT JOIN tecnicos       t  ON t.id  = ch.tecnico_id
          LEFT JOIN sla_definicoes sd ON sd.prioridade = ch.prioridade
          WHERE ch.status IN ('aberto', 'em_atendimento')
        )
        SELECT *,
          -- Qual relógio ainda corre, e quanto falta nele.
          --
          -- TTFR  → só até alguém responder pela primeira vez.
          -- Chegada → só até o técnico chegar no prédio.
          -- TTR   → sempre, até fechar.
          --
          -- O que vale para a fila é o MENOR restante entre os que ainda
          -- correm: é esse que estoura primeiro, e é ele que ordena.
          CASE WHEN primeira_resposta_em IS NULL AND ttfr_min IS NOT NULL
               THEN ttfr_min - minutos_abertos END AS resta_ttfr,
          CASE WHEN tecnico_chegou_em IS NULL AND sla_chegada_min IS NOT NULL
               THEN sla_chegada_min - minutos_abertos END AS resta_chegada,
          CASE WHEN ttr_min IS NOT NULL
               THEN ttr_min - minutos_abertos END AS resta_ttr
        FROM base
      `),

      // Reservatórios com a última leitura, só dos condomínios que têm.
      // ⚠️ DISTINCT ON precisa que o ORDER BY comece pela mesma expressão —
      // é o que faz o Postgres devolver a linha mais recente por device.
      pool.query(`
        SELECT DISTINCT ON (r.id)
          r.id, r.condominio_id, r.nome, r.device_id, r.last_seen,
          l.nivel_pct, l.criado_em AS leitura_em
        FROM reservatorios r
        LEFT JOIN leituras l ON l.device_id = r.device_id
        WHERE r.ativo = true
        ORDER BY r.id, l.criado_em DESC NULLS LAST
      `),

      // ⚠️ A coluna de tempo é `atualizada_em` (feminino) e a posição só vale
      // por 30 minutos — a mesma janela de `GET /tecnicos/localizacao`, para
      // um pin não ficar preso onde o técnico esteve de manhã.
      //
      // ⚠️ O que NÃO foi copiado de lá: a janela de expediente, que zera a
      // lista inteira fora do horário. Ali ela existe para o mapa não mostrar
      // ninguém depois das 18h; aqui a lista serve para DESPACHAR, e um
      // chamado P1 às 18h10 precisa saber quem ainda está em campo. Se essa
      // diferença incomodar, o lugar de resolver é aqui, não no outro
      // endpoint.
      pool.query(`
        SELECT
          t.id, t.nome, t.disponivel,
          tl.lat, tl.lng, tl.atualizada_em AS gps_em,
          COUNT(ch.id) FILTER (
            WHERE ch.status IN ('aberto','em_atendimento')
          )::int AS abertos
        FROM tecnicos t
        LEFT JOIN tecnico_localizacoes tl
               ON tl.tecnico_id = t.id
              AND tl.atualizada_em > NOW() - INTERVAL '30 minutes'
        LEFT JOIN chamados ch ON ch.tecnico_id = t.id
        WHERE t.ativo = true AND COALESCE(t.cargo, 'tecnico') = 'tecnico'
        GROUP BY t.id, t.nome, t.disponivel, tl.lat, tl.lng, tl.atualizada_em
        ORDER BY t.disponivel DESC NULLS LAST, t.nome
      `),
    ]);

    // Reservatórios agrupados por condomínio.
    const agora = Date.now();
    const porCondo = new Map();
    for (const r of reservRes.rows) {
      const visto = r.last_seen ? new Date(r.last_seen).getTime() : null;
      const mudo = !visto || (agora - visto) / 60000 > OFFLINE_MINUTES;
      const pct = r.nivel_pct == null ? null : Number(r.nivel_pct);
      if (!porCondo.has(r.condominio_id)) porCondo.set(r.condominio_id, []);
      porCondo.get(r.condominio_id).push({
        id: r.id,
        nome: r.nome,
        nivel_pct: mudo ? null : pct,
        mudo,
        banda: mudo ? "mudo"
             : pct == null ? "mudo"
             : pct < NIVEL_CRITICO ? "critico"
             : pct < NIVEL_BAIXO ? "baixo" : "ok",
      });
    }

    const fila = chamadosRes.rows.map((c) => {
      // Os relógios que ainda correm, com o nome de cada um. O menor manda.
      const relogios = [
        { nome: "primeira resposta", resta: c.resta_ttfr },
        { nome: "chegada",           resta: c.resta_chegada },
        { nome: "resolução",         resta: c.resta_ttr },
      ].filter((r) => r.resta !== null && r.resta !== undefined);

      const menor = relogios.length
        ? relogios.reduce((a, b) => (Number(a.resta) <= Number(b.resta) ? a : b))
        : null;

      const reservatorios = porCondo.get(c.condominio_id) || [];

      return {
        id: c.id,
        titulo: c.titulo,
        descricao: c.descricao,
        categoria: c.categoria,
        prioridade: c.prioridade,
        status: c.status,
        criado_em: c.criado_em,
        minutos_abertos: c.minutos_abertos,
        origem: origemDe(c),
        sla: menor
          ? { relogio: menor.nome, resta_min: Number(menor.resta),
              estourado: Number(menor.resta) < 0 }
          : null,
        condominio: c.condominio_id ? {
          id: c.condominio_id,
          nome: c.nome_fantasia || c.nome,
          bairro: c.bairro,
          cidade: c.cidade,
          lat: c.lat == null ? null : Number(c.lat),
          lng: c.lng == null ? null : Number(c.lng),
        } : null,
        tecnico: c.tecnico_id ? { id: c.tecnico_id, nome: c.tecnico_nome } : null,
        a_caminho_em: c.tecnico_a_caminho_em,
        chegou_em: c.tecnico_chegou_em,
        reservatorios,
        tem_telemetria: reservatorios.length > 0,
      };
    });

    // A ordenação da tela. Sem SLA definido vai para o fim: não dá para
    // prometer prazo que não existe, e fingir um número seria pior.
    fila.sort((a, b) => {
      if (!a.sla && !b.sla) return a.id - b.id;
      if (!a.sla) return 1;
      if (!b.sla) return -1;
      return a.sla.resta_min - b.sla.resta_min;
    });

    return res.json({
      agora: new Date().toISOString(),
      fila,
      tecnicos: tecnicosRes.rows.map((t) => ({
        id: t.id,
        nome: t.nome,
        disponivel: !!t.disponivel,
        lat: t.lat == null ? null : Number(t.lat),
        lng: t.lng == null ? null : Number(t.lng),
        gps_em: t.gps_em,
        abertos: Number(t.abertos) || 0,
      })),
      limiares: { baixo: NIVEL_BAIXO, critico: NIVEL_CRITICO },
    });
  } catch (err) {
    console.error("[operador] GET /fila:", err);
    return res.status(500).json({ error: "Erro ao carregar a fila do turno" });
  }
});

/**
 * De onde o chamado veio.
 *
 * ⚠️ HEURÍSTICA, não dado. `chamados` não tem coluna `origem` — o
 * `abrirChamadoAuto` não marca a procedência, e as cinco origens listadas em
 * chamados-sla.md só se distinguem por efeito colateral:
 *   `conversa_id`          → nasceu de uma conversa de WhatsApp (IA)
 *   `plano_manutencao_id`  → nasceu do job de preventiva
 *   categoria automática   → nasceu da telemetria (nível ou offline)
 *   resto                  → alguém digitou
 *
 * O caso ambíguo é real e conhecido: um chamado de `nivel_baixo` aberto à mão
 * por um operador aparece como "telemetria". Resolver de verdade pede uma
 * coluna `origem` — está no roadmap, e até lá esta função é a fonte única
 * dessa leitura, para o erro ficar num lugar só.
 */
const CATEGORIAS_AUTOMATICAS = new Set(["nivel_baixo", "bomba_falha"]);

function origemDe(c) {
  if (c.conversa_id) return "whatsapp";
  if (c.plano_manutencao_id) return "preventiva";
  if (CATEGORIAS_AUTOMATICAS.has(c.categoria)) return "telemetria";
  return "manual";
}

module.exports = { operadorRouter: router };
