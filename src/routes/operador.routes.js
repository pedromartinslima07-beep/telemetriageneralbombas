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
// O mesmo registro de auditoria que `POST /chamados` grava. Um chamado que
// nasce aqui não pode ficar de fora do histórico só por ter outra porta.
const { registrarCriacao, registrarMudancas } = require("../services/chamado-historico.service");
const { resolverTecnico } = require("../services/chamado-atribuicao.service");
const {
  competenciaValida, competenciaDe, mesDe, estadoDa, origemDoTecnico,
} = require("../services/preventivas.service");

const router = express.Router();

// Faixas de nível — as MESMAS do resto do sistema (telemetria.md).
// Duplicadas aqui de propósito: o front do operador não carrega admin.js.
const NIVEL_BAIXO = 45;
const NIVEL_CRITICO = 20;

// Minutos sem leitura a partir dos quais o reservatório é considerado mudo.
// Mesmo valor de `OFFLINE_MINUTES` em src/config.js — importado de lá para
// não virar um segundo número de verdade.
const { OFFLINE_MINUTES } = require("../config");

/* A EQUIPE QUE PODE RECEBER UM CHAMADO — uma consulta, dois consumidores:
   `GET /operador/fila` (que a desenha no mapa e no diálogo de despacho) e
   `GET /operador/tecnicos` (que a lista nos diálogos de abrir chamado). Escrita
   uma vez porque divergir aqui teria o pior sintoma possível: um técnico que
   aparece para escolher numa tela e some na outra.

   ⚠️ A coluna de tempo é `atualizada_em` (feminino) e a posição só vale por 30
   minutos — a mesma janela de `GET /tecnicos/localizacao`, para um pin não
   ficar preso onde o técnico esteve de manhã.

   ⚠️ O que NÃO foi copiado de lá: a janela de expediente, que zera a lista
   inteira fora do horário. Ali ela existe para o mapa não mostrar ninguém
   depois das 18h; aqui a lista serve para DESPACHAR, e um chamado P1 às 18h10
   precisa saber quem ainda está em campo. Se essa diferença incomodar, o lugar
   de resolver é aqui, não no outro endpoint.

   ⚠️ O `WHERE` é a MESMA regra do `resolverTecnico` (ativo + cargo técnico):
   esta consulta diz quem a tela oferece, e aquele serviço diz quem o banco
   aceita. As duas precisam responder igual, senão a tela oferece quem a
   gravação recusa. */
const SQL_EQUIPE = `
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
`;

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
    const [chamadosRes, reservRes, tecnicosRes, condosRes] = await Promise.all([
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

      pool.query(SQL_EQUIPE),

      // ⚠️ A CARTEIRA INTEIRA, para o mapa nunca ser um retângulo vazio
      // (31/08/2026). Ele só tinha o que desenhar quando havia chamado com
      // prédio geocodificado OU técnico com GPS dos últimos 30 min — e hoje,
      // em produção, `tecnico_localizacoes` tem 3 linhas no total. Num turno
      // calmo o operador abria a tela e via uma frase no lugar do mapa.
      //
      // ⚠️ ISTO NÃO TRANSFORMA A PEÇA NO "Mapa de Condomínios" DO ADMIN, e a
      // diferença é de PAPEL: lá cada prédio é o assunto e a cor dele é o
      // estado da telemetria; aqui a carteira é FUNDO — de onde a decisão
      // acontece —, e quem tem cor e clique continua sendo o chamado. O
      // enquadramento também segue mandado pela decisão, nunca pelo fundo
      // (ver `enquadrarMapa` no operador.js).
      //
      // ⚠️ Só os ATIVOS e só com coordenada: prédio sem geocodificação não
      // vira ponto nenhum, e fingir um centro para ele poria a carteira no
      // lugar errado.
      pool.query(`
        SELECT id, COALESCE(nome_fantasia, nome) AS nome, bairro, lat, lng
          FROM condominios
         WHERE ativo = true AND lat IS NOT NULL AND lng IS NOT NULL
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
      // O fundo do mapa. Nomes curtos porque a lista viaja a cada 30s: com a
      // carteira real (86 prédios) são ~4 KB por ciclo.
      //
      // ⚠️ CADA PRÉDIO LEVA A PIOR BANDA DOS RESERVATÓRIOS DELE, e isso é o
      // que salva a camada de virar poluição. Na primeira versão os 86 pontos
      // eram cinzas idênticos: diziam "temos prédios" e nada mais, e o Pedro
      // mandou o print — a Grande São Paulo coberta de quadradinhos anônimos.
      // Com a banda, o mapa fica quieto onde está tudo em ordem e ACENDE onde
      // tem alguma coisa. É A Regra do Crítico Silencioso: estado não aparece
      // em repouso.
      //
      // ⚠️ NÃO CUSTA CONSULTA NENHUMA: `porCondo` já foi montado acima, para
      // os reservatórios da fila. Prédio sem reservatório fica com banda nula
      // e continua neutro — "sem telemetria" não é um estado ruim, é ausência
      // de instrumento, e pintá-lo diria que há problema onde não há.
      condominios: condosRes.rows.map((c) => ({
        id: c.id, nome: c.nome, bairro: c.bairro,
        lat: Number(c.lat), lng: Number(c.lng),
        banda: piorBanda(porCondo.get(c.id)),
      })),
      limiares: { baixo: NIVEL_BAIXO, critico: NIVEL_CRITICO },
    });
  } catch (err) {
    console.error("[operador] GET /fila:", err);
    return res.status(500).json({ error: "Erro ao carregar a fila do turno" });
  }
});

/**
 * A pior banda entre os reservatórios de um prédio.
 *
 * ⚠️ A ORDEM É A DA GRAVIDADE, não a alfabética: crítico ganha de baixo, que
 * ganha de mudo. Um prédio com uma caixa em 12% e outra sem leitura é um
 * prédio em crítico — mostrar "mudo" ali esconderia o que importa.
 *
 * ⚠️ E `mudo` NÃO é o pior. Não saber é diferente de saber que está ruim, e a
 * tela do cliente já trata os dois separados desde 14/08 ("isso não quer dizer
 * que falta água — quer dizer que não estamos conseguindo medir").
 */
function piorBanda(reservatorios) {
  if (!reservatorios || !reservatorios.length) return null;
  for (const b of ["critico", "baixo", "mudo"]) {
    if (reservatorios.some((r) => r.banda === b)) return b;
  }
  return "ok";
}

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

/**
 * GET /operador/orcamentos
 *
 * Os orçamentos APROVADOS, para o operador saber o que foi autorizado em cada
 * prédio. Página: `/operador/painel/orcamentos`.
 *
 * ⚠️ NENHUM VALOR SAI DAQUI, e isto é a regra do endpoint, não um detalhe do
 * front. Não há `valor`, `valor_unitario`, soma de linhas nem coluna que dê
 * para derivar preço — o operador precisa saber O QUE foi aprovado e ONDE,
 * não quanto custou. Esconder no CSS deixaria o número viajando na resposta,
 * visível na aba Network de qualquer navegador. **Ao mexer nesta query, não
 * traga coluna de dinheiro "porque é fácil somar depois".**
 *
 * ⚠️ A ORDEM SAI DE UM `COALESCE` de três datas, e isso é dado de produção,
 * não paranoia: dos 7 aprovados no banco de teste, **6 têm `aprovado_em`
 * nulo** — a coluna só passou a ser preenchida quando a resposta pelo painel
 * do cliente entrou. Ordenar só por ela jogaria quase tudo para o fim.
 *
 * O guard é o mesmo do `/fila`: `adminOnly` já inclui o perfil `operador`
 * (o corte de 27/08 tirou o operador do `gestaoOnly`, que é o que protege as
 * rotas de orçamento do admin — inclusive as que devolvem valor).
 */
router.get("/orcamentos", authRequired, adminOnly, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        o.id, o.numero, o.tipo, o.status,
        o.constatacao, o.os_id, os.numero AS os_numero,
        -- As três datas, para o front escolher a que existe (ver acima).
        o.aprovado_em, o.respondido_em, o.criado_em,
        -- Quem respondeu: o nome digitado na hora vale mais que o da conta,
        -- porque é a pessoa do condomínio que assumiu a decisão.
        COALESCE(o.respondido_nome, ur.nome) AS aprovado_por_nome,
        o.respondido_cargo,
        -- Cliente avulso (pessoa física) não tem condomínio: o nome dele
        -- ocupa o mesmo lugar na tela, como já faz no PDF.
        COALESCE(c.nome, o.cliente_nome) AS condominio_nome,
        c.bairro, c.cidade,
        -- O SERVIÇO. Em orçamento por cláusula quem diz é a coluna tipo; em
        -- orçamento de peças são as LINHAS, e é por isso que elas vêm aqui
        -- (só descrição e quantidade — quantidade não é preço).
        -- (Sem crase neste comentário: ele vive dentro de um template
        --  literal, e crase aqui FECHA o template. Ver CLAUDE.md.)
        COALESCE(
          (SELECT json_agg(json_build_object('descricao', l.descricao, 'quantidade', l.quantidade)
                           ORDER BY l.id)
             FROM orcamento_linhas l WHERE l.orcamento_id = o.id),
          '[]'::json
        ) AS linhas,
        -- O CHAMADO QUE JÁ EXECUTA ESTE ORÇAMENTO (079), se existir.
        -- ⚠️ O MAIS RECENTE, não "o aberto": um orçamento pode ter gerado um
        -- chamado que já foi fechado, e a tela precisa dizer "já foi feito"
        -- em vez de oferecer abrir de novo como se nada tivesse acontecido.
        -- Quem decide entre reabrir e avisar é o front, com o status na mão.
        ch.id     AS chamado_id,
        ch.status AS chamado_status,
        -- A O.S. QUE EXECUTOU O SERVIÇO (03/09/2026). O vínculo sempre existiu
        -- em duas pernas — orcamentos <- chamados.orcamento_id, e
        -- ordens_servico.chamado_id -> chamados — e ninguém percorria a
        -- segunda. Sem ela a tela falava de "chamado #73 fechado", que é
        -- detalhe interno, quando o que aconteceu foi uma O.S. assinada no
        -- prédio.
        -- (Sem crase neste comentario: ele vive dentro de um template literal.)
        ose.id            AS exec_os_id,
        ose.numero        AS exec_os_numero,
        ose.finalizada_em AS exec_os_finalizada_em,
        -- Executado SEM chamado (080). É o caso mais comum no mundo real: o
        -- técnico já estava no prédio e resolveu na hora. Ver a rota
        -- POST /orcamentos/:id/executado lá embaixo.
        o.executado_em,
        ue.nome AS executado_por_nome
      FROM orcamentos o
      LEFT JOIN usuarios ue ON ue.id = o.executado_por
      LEFT JOIN LATERAL (
        SELECT c2.id, c2.status
          FROM chamados c2
         WHERE c2.orcamento_id = o.id
         ORDER BY (c2.status IN ('aberto','em_atendimento')) DESC, c2.criado_em DESC
         LIMIT 1
      ) ch ON true
      -- ⚠️ DEPENDE DO LATERAL ACIMA e por isso vem DEPOIS dele: um LATERAL só
      -- enxerga o que já foi juntado à sua esquerda. Invertida a ordem, a coluna
      -- ch.id ainda nao existe e o Postgres recusa a query.
      -- (Sem crase aqui: comentario dentro de template literal. Ver CLAUDE.md.)
      LEFT JOIN LATERAL (
        SELECT os2.id, os2.numero, os2.finalizada_em
          FROM ordens_servico os2
         WHERE os2.chamado_id = ch.id
         ORDER BY (os2.finalizada_em IS NOT NULL) DESC, os2.finalizada_em DESC, os2.id DESC
         LIMIT 1
      ) ose ON true
      LEFT JOIN condominios     c  ON c.id  = o.condominio_id
      LEFT JOIN ordens_servico  os ON os.id = o.os_id
      LEFT JOIN usuarios        ur ON ur.id = o.respondido_por
      WHERE o.status = 'aprovado'
      ORDER BY COALESCE(o.aprovado_em, o.respondido_em, o.criado_em) DESC
      LIMIT 300
    `);
    return res.json(r.rows);
  } catch (err) {
    console.error("[operador] GET /orcamentos:", err);
    return res.status(500).json({ error: "Erro ao listar os orçamentos aprovados" });
  }
});

/**
 * GET /operador/tecnicos
 *
 * A equipe que pode receber um chamado — id, nome, se está livre, quantos
 * chamados carrega. É a lista do seletor "Técnico" dos diálogos de abrir
 * chamado (31/08/2026).
 *
 * ⚠️ EXISTE PARA A TELA DE APROVADOS NÃO CHAMAR `GET /tecnicos`, e o motivo é
 * privacidade, não gosto: aquele endpoint devolve a ficha inteira do
 * funcionário — CPF, RG, endereço, data de nascimento — porque serve o cadastro
 * do admin. Uma tela que só precisa de nomes não tem por que receber isso, e
 * dado que não trafega não vaza.
 *
 * ⚠️ A tela da FILA não usa este endpoint: lá a equipe já vem no `/operador/fila`
 * (a tese da superfície: uma request monta a tela). Aqui é o mesmo raciocínio
 * do `/prazos` — é diálogo, e diálogo não entra no caminho crítico da lista.
 */
router.get("/tecnicos", authRequired, adminOnly, async (req, res) => {
  try {
    const r = await pool.query(SQL_EQUIPE);
    return res.json(r.rows);
  } catch (err) {
    console.error("[operador] GET /tecnicos:", err);
    return res.status(500).json({ error: "Erro ao buscar a equipe" });
  }
});

/**
 * GET /operador/prazos
 *
 * O que a AJUDA da tela explica: os prazos de cada prioridade e as faixas de
 * nível. Página: o diálogo "Como esta tela funciona", nas duas telas.
 *
 * ⚠️ ESTE ENDPOINT EXISTE PARA A AJUDA NÃO MENTIR. Os prazos moram em
 * `sla_definicoes` e são editáveis pelo admin; escritos à mão no front, eles
 * viram documentação que envelhece em silêncio — e é exatamente o que já
 * tinha acontecido: a dica do "Novo chamado" dizia "P2 24–48h" quando o
 * `ttr_min` de P2 é 1440 (24h), e "P4 conforme agenda" quando P4 tem 14400
 * (10 dias). Ajuda errada é pior que ajuda nenhuma, ainda mais para quem
 * abriu a ajuda justamente por não saber.
 *
 * ⚠️ E É PEDIDO SÓ QUANDO A AJUDA ABRE, não na carga da tela. A tese da
 * superfície ("uma request monta a tela inteira") é sobre MONTAR A TELA; um
 * diálogo que a maioria dos turnos nunca abre não entra no caminho crítico
 * da fila.
 */
router.get("/prazos", authRequired, adminOnly, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT prioridade, ttfr_min, sla_chegada_min, ttr_min
        FROM sla_definicoes
       ORDER BY prioridade
    `);
    return res.json({
      prazos: r.rows,
      // As faixas e a janela do sensor mudo saem daqui pelo mesmo motivo dos
      // prazos: são as MESMAS constantes que classificam a fila, no topo
      // deste arquivo. A ajuda não pode ter a sua própria versão delas.
      limiares: { baixo: NIVEL_BAIXO, critico: NIVEL_CRITICO },
      offline_min: OFFLINE_MINUTES,
    });
  } catch (err) {
    console.error("[operador] GET /prazos:", err);
    return res.status(500).json({ error: "Erro ao carregar os prazos" });
  }
});


/* ═══ Preventivas do mês ══════════════════════════════════════════════════
 *
 * A terceira tela do operador (`/operador/painel/preventivas`), no molde de
 * Aprovados. Pedido do Pedro (03/09/2026): *"preciso que em operador fique
 * todas as preventivas do mês, separada bonitinho as que já foram feitas e as
 * que faltam fazer, tem que dar para enviar esses chamados para o técnico por
 * região [...] ou escolher condomínio por condomínio qual vai para cada
 * técnico"*.
 *
 * ⚠️ O QUE ESTA TELA LISTA SÃO PLANOS, NÃO CHAMADOS — mesma escolha do
 * `meu-roteiro`. O chamado P4 só nasce quando o serviço começa
 * (`executarPlano`); listar chamados mostraria só o que já foi iniciado, e o
 * que a tela precisa responder é justamente o que FALTA.
 */

// GET /operador/preventivas?mes=YYYY-MM
//
// Uma request monta a tela inteira — mesma regra do painel do turno: os planos
// do mês com estado e responsável, mais os técnicos para o diálogo de escala.
router.get("/preventivas", authRequired, adminOnly, async (req, res) => {
  const mes = req.query.mes;
  if (mes != null && mes !== "" && !competenciaValida(mes)) {
    return res.status(400).json({ error: "mes inválido (use YYYY-MM)" });
  }
  const competencia = competenciaDe(mes);

  try {
    // ⚠️ A JANELA É O MÊS DA COMPETÊNCIA, e `proxima_em` é quem manda. Todo
    // plano de produção hoje é mensal, mas os de 90/180/365 dias existem no
    // schema: um semestral que vence em setembro É uma preventiva de setembro.
    //
    // ⚠️ O VENCIDO DE MESES ANTERIORES ENTRA JUNTO (`proxima_em` menor que o
    // dia 1), e é metade do ponto da tela: preventiva que passou do mês não
    // vira passado, vira dívida. Aparece com `atrasada` e sobe na lista.
    //
    // ⚠️ `$1::date` EM TODOS OS USOS. O mesmo parâmetro entra como valor e
    // dentro de comparação — é o 42P08 do CLAUDE.md, e a competência aparece
    // em seis lugares nesta query.
    const r = await pool.query(
      `SELECT
         pm.id, pm.titulo, pm.descricao, pm.periodicidade_dias,
         pm.proxima_em, pm.ultima_em,
         c.id     AS condominio_id,
         COALESCE(NULLIF(c.nome_fantasia,''), c.nome) AS condominio_nome,
         c.nome   AS condominio_razao_social,
         c.bairro, c.cidade, c.zona,
         pm.proxima_em < $1::date AS atrasada,

         pa.tecnico_id            AS atribuido_tecnico_id,
         ta.nome                  AS atribuido_tecnico_nome,
         pa.atribuido_em,
         ua.nome                  AS atribuido_por_nome,

         zr.tecnico_id            AS zona_tecnico_id,
         tz.nome                  AS zona_tecnico_nome,

         cha.id     AS chamado_aberto_id,
         cha.status AS chamado_aberto_status,
         chf.id     AS chamado_fechado_id,
         chf.fechado_em,
         (pm.ultima_em IS NOT NULL
          AND pm.ultima_em >= $1::date
          AND pm.ultima_em < ($1::date + INTERVAL '1 month')) AS feita_no_mes
       FROM planos_manutencao pm
       JOIN condominios c ON c.id = pm.condominio_id AND c.ativo = TRUE
       LEFT JOIN planos_atribuicoes pa
              ON pa.plano_id = pm.id AND pa.competencia = $1::date
       LEFT JOIN tecnicos ta ON ta.id = pa.tecnico_id
       LEFT JOIN usuarios ua ON ua.id = pa.atribuido_por
       LEFT JOIN LATERAL (
         SELECT pzr.tecnico_id
           FROM planos_zona_responsavel pzr
          WHERE pzr.zona = c.zona
          ORDER BY pzr.tecnico_id
          LIMIT 1
       ) zr ON TRUE
       LEFT JOIN tecnicos tz ON tz.id = zr.tecnico_id
       LEFT JOIN LATERAL (
         SELECT ch.id, ch.status FROM chamados ch
          WHERE ch.plano_manutencao_id = pm.id
            AND ch.status NOT IN ('fechado', 'cancelado')
          ORDER BY ch.id DESC LIMIT 1
       ) cha ON TRUE
       LEFT JOIN LATERAL (
         SELECT ch.id, ch.fechado_em FROM chamados ch
          WHERE ch.plano_manutencao_id = pm.id
            AND ch.status = 'fechado'
            AND ch.fechado_em >= $1::date
            AND ch.fechado_em <  ($1::date + INTERVAL '1 month')
          ORDER BY ch.fechado_em DESC LIMIT 1
       ) chf ON TRUE
       WHERE pm.ativo = TRUE
         AND pm.proxima_em < ($1::date + INTERVAL '1 month')
       ORDER BY pm.proxima_em ASC, c.zona NULLS LAST, 8`,
      [competencia]
    );

    const planos = r.rows.map((p) => ({
      ...p,
      estado: estadoDa(p),
      tecnico_id:   p.atribuido_tecnico_id || p.zona_tecnico_id || null,
      tecnico_nome: p.atribuido_tecnico_nome || p.zona_tecnico_nome || null,
      tecnico_origem: origemDoTecnico(p),
    }));

    // A equipe, para o diálogo de escala. `abertos` deixa a tela dizer quem já
    // está carregado antes de somar mais um prédio.
    const tec = await pool.query(
      `SELECT t.id, t.nome,
              (SELECT count(*)::int FROM chamados ch
                WHERE ch.tecnico_id = t.id
                  AND ch.status IN ('aberto','em_atendimento')) AS abertos
         FROM tecnicos t
        WHERE t.ativo = TRUE
        ORDER BY t.nome`
    );

    return res.json({
      mes: mesDe(competencia),
      competencia,
      planos,
      tecnicos: tec.rows,
    });
  } catch (err) {
    console.error("[operador] GET /preventivas:", err);
    return res.status(500).json({ error: "Erro ao carregar as preventivas do mês" });
  }
});

// POST /operador/preventivas/atribuir
// Body: { plano_ids: [1,2,3], tecnico_id: 5|null, mes?: "YYYY-MM" }
//
// Escala (ou desescala, com `tecnico_id` nulo) um lote de preventivas. É a
// mesma rota para os dois caminhos que o Pedro pediu — "por região" é a tela
// mandando os ids de uma zona, "condomínio por condomínio" é ela mandando os
// que a pessoa marcou. O backend não precisa saber a diferença.
//
// ⚠️ EM LOTE E NUMA TRANSAÇÃO. Despachar uma zona é uma decisão só; metade
// escalada e metade não deixaria a tela mentir sobre o que foi enviado.
router.post("/preventivas/atribuir", authRequired, adminOnly, async (req, res) => {
  const { plano_ids, tecnico_id, mes } = req.body || {};

  if (!Array.isArray(plano_ids) || !plano_ids.length) {
    return res.status(400).json({ error: "Escolha ao menos uma preventiva" });
  }
  if (plano_ids.length > 200) {
    return res.status(400).json({ error: "No máximo 200 preventivas por vez" });
  }
  const ids = plano_ids.map(Number);
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) {
    return res.status(400).json({ error: "plano_ids inválido" });
  }
  if (mes != null && mes !== "" && !competenciaValida(mes)) {
    return res.status(400).json({ error: "mes inválido (use YYYY-MM)" });
  }
  const competencia = competenciaDe(mes);

  // Nulo desescala — é como a tela devolve um prédio para a régua da zona.
  const tecId = tecnico_id == null || tecnico_id === "" ? null : Number(tecnico_id);
  if (tecId !== null && (!Number.isInteger(tecId) || tecId <= 0)) {
    return res.status(400).json({ error: "tecnico_id inválido" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (tecId !== null) {
      const t = await client.query("SELECT id FROM tecnicos WHERE id = $1 AND ativo = TRUE", [tecId]);
      if (!t.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Técnico não encontrado ou inativo" });
      }
    }

    // ⚠️ SÓ PLANOS ATIVOS, e o filtro é aqui e não no front: a tela lista o mês
    // corrente, mas a requisição chega com ids que podem ter sido desativados
    // entre o carregamento e o clique.
    const validos = await client.query(
      "SELECT id FROM planos_manutencao WHERE id = ANY($1::int[]) AND ativo = TRUE",
      [ids]
    );
    const idsOk = validos.rows.map((x) => x.id);
    if (!idsOk.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Nenhuma preventiva válida entre as escolhidas" });
    }

    if (tecId === null) {
      await client.query(
        "DELETE FROM planos_atribuicoes WHERE plano_id = ANY($1::int[]) AND competencia = $2::date",
        [idsOk, competencia]
      );
    } else {
      // ⚠️ UPSERT, não INSERT. Reescalar um prédio já escalado é o caso comum
      // (técnico entrou de férias no meio do mês); um INSERT cru estouraria na
      // chave primária e o operador levaria "erro" para uma ação que faz sentido.
      await client.query(
        `INSERT INTO planos_atribuicoes (plano_id, competencia, tecnico_id, atribuido_por)
         SELECT id, $2::date, $3::int, $4::int FROM unnest($1::int[]) AS t(id)
         ON CONFLICT (plano_id, competencia) DO UPDATE
            SET tecnico_id    = EXCLUDED.tecnico_id,
                atribuido_em  = NOW(),
                atribuido_por = EXCLUDED.atribuido_por`,
        [idsOk, competencia, tecId, req.user.id]
      );
    }

    await client.query("COMMIT");
    return res.json({
      ok: true,
      competencia,
      mes: mesDe(competencia),
      atribuidos: idsOk.length,
      // Os ids que a tela mandou e não existem mais: ela some com eles em vez
      // de deixar linha fantasma marcada.
      ignorados: ids.filter((n) => !idsOk.includes(n)),
      tecnico_id: tecId,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[operador] POST /preventivas/atribuir:", err);
    return res.status(500).json({ error: "Erro ao escalar as preventivas" });
  } finally {
    client.release();
  }
});

/**
 * POST /operador/orcamentos/:id/chamado
 *
 * Abre um chamado para EXECUTAR um orçamento aprovado, já vinculado a ele
 * (`chamados.orcamento_id`, migration 079).
 *
 * ⚠️ POR QUE NÃO REUSAR `POST /chamados`. Aquela rota é a porta genérica e
 * não conhece orçamento: ela não sabe de qual prédio o orçamento é, não
 * escreve o vínculo e não tem como impedir o clique duplo. Repetir o
 * `INSERT` aqui é o preço de a ligação existir — e é um `INSERT` só, com a
 * mesma validação de título e descrição.
 *
 * ⚠️ E NÃO APLICA O BUMP DE RECORRÊNCIA de `POST /chamados`. Lá, dois
 * chamados da mesma categoria no mesmo prédio em 30 dias sobem um nível —
 * é detecção de problema que volta. Aqui o chamado nasce de um serviço
 * AUTORIZADO: subir a prioridade de uma limpeza agendada porque houve outra
 * limpeza no mês passado inverteria a fila do turno com trabalho de rotina.
 *
 * O prédio NÃO vem do corpo da requisição: vem do orçamento. Deixar o front
 * mandar permitiria abrir, a partir do orçamento de um prédio, um chamado em
 * outro — e o vínculo passaria a mentir.
 */
// ⚠️ A lista mora no `prioridade.service.js` — ver o cabeçalho de lá.
const { CATEGORIAS: CATEGORIAS_CHAMADO } = require("../services/prioridade.service");
const PRIORIDADES_CHAMADO = ["p1", "p2", "p3", "p4"];

router.post("/orcamentos/:id/chamado", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0)
    return res.status(400).json({ error: "Orçamento inválido" });

  const { titulo, descricao, categoria, prioridade, tecnico_id } = req.body || {};
  if (!titulo || typeof titulo !== "string" || !titulo.trim())
    return res.status(400).json({ error: "Escreva um título para o chamado" });
  if (!descricao || typeof descricao !== "string" || descricao.trim().length < 5)
    return res.status(400).json({ error: "Descreva o serviço com pelo menos 5 caracteres" });
  if (categoria && !CATEGORIAS_CHAMADO.includes(categoria))
    return res.status(400).json({ error: "Categoria inválida" });
  if (prioridade && !PRIORIDADES_CHAMADO.includes(prioridade))
    return res.status(400).json({ error: "Prioridade inválida" });

  try {
    const tec = await resolverTecnico(tecnico_id);
    if (!tec.ok) return res.status(400).json({ error: tec.erro });

    const orc = await pool.query(
      `SELECT id, numero, status, condominio_id FROM orcamentos WHERE id = $1`, [id]
    );
    if (!orc.rows.length)
      return res.status(404).json({ error: "Orçamento não encontrado" });

    const o = orc.rows[0];
    // A tela lista só aprovados; a checagem existe porque a rota é uma porta
    // e portas se abrem por URL. Um chamado que promete executar um orçamento
    // recusado é pior que um erro.
    if (o.status !== "aprovado")
      return res.status(409).json({ error: "Este orçamento não está aprovado." });

    // ⚠️ CLIQUE DUPLO É O CASO NORMAL, não a exceção: a lista não recarrega
    // sozinha (ver o comentário no operador-orcamentos.js) e o operador está
    // ao telefone. Havendo chamado ABERTO deste orçamento, devolve o que já
    // existe com 200 e `ja_existia` — o front leva para ele em vez de mostrar
    // erro. Chamado FECHADO não bloqueia: o serviço pode voltar.
    const aberto = await pool.query(
      `SELECT id, tecnico_id FROM chamados
        WHERE orcamento_id = $1 AND status IN ('aberto','em_atendimento')
        ORDER BY criado_em DESC LIMIT 1`, [id]
    );
    if (aberto.rows.length) {
      const ja = aberto.rows[0];
      // ⚠️ O TÉCNICO ESCOLHIDO NÃO SE PERDE NO CLIQUE DUPLO — mas só PREENCHE
      // VAZIO, nunca troca. Quem clicou de novo escolhendo alguém quis
      // despachar este serviço; devolver "já existia" e ignorar a escolha faria
      // a tela dizer que registrou algo que não registrou. Trocar um técnico
      // que já estava lá seria o outro extremo: o segundo clique desfazendo,
      // sem aviso, o despacho do primeiro (ou o de outro operador).
      let atribuido = false;
      if (tec.id && !ja.tecnico_id) {
        const upd = await pool.query(
          `UPDATE chamados
              SET tecnico_id = $2,
                  primeira_resposta_em = COALESCE(primeira_resposta_em, NOW()),
                  atualizado_em = NOW()
            WHERE id = $1 AND tecnico_id IS NULL
        RETURNING id, tecnico_id`,
          [ja.id, tec.id]
        );
        atribuido = upd.rows.length > 0;
        if (atribuido) {
          registrarMudancas({
            chamadoId: ja.id,
            antes: { tecnico_id: null },
            depois: { tecnico_id: tec.id },
            alteradoPor: req.user.id,
          });
        }
      }
      return res.json({ id: ja.id, ja_existia: true, tecnico_atribuido: atribuido });
    }

    // ⚠️ `$7::int` NAS DUAS APARIÇÕES: o mesmo parâmetro como valor de coluna e
    // dentro de um CASE deduz tipos diferentes e o Postgres recusa a query no
    // parse (42P08). Ver CLAUDE.md — e a rota de responder orçamento, que
    // nasceu quebrada exatamente assim.
    // ⚠️ Atribuir marca o TTFR (mesma regra do PATCH) e NÃO mexe no status:
    // `em_atendimento` continua sendo só do app do técnico.
    const ins = await pool.query(
      `INSERT INTO chamados
         (condominio_id, titulo, descricao, prioridade, categoria, orcamento_id,
          tecnico_id, primeira_resposta_em, status)
       VALUES ($1, $2, $3, $4, $5, $6,
               $7::int, CASE WHEN $7::int IS NULL THEN NULL ELSE NOW() END, 'aberto')
       RETURNING id, status, prioridade, categoria, titulo, condominio_id, orcamento_id,
                 tecnico_id, criado_em`,
      [
        o.condominio_id || null,
        titulo.trim().slice(0, 255),
        descricao.trim().slice(0, 4000),
        prioridade || "p4",
        categoria || "manutencao",
        id,
        tec.id,
      ]
    );
    const novo = ins.rows[0];
    registrarCriacao({ chamadoId: novo.id, alteradoPor: req.user.id });
    if (novo.tecnico_id) {
      registrarMudancas({
        chamadoId: novo.id,
        antes: { tecnico_id: null },
        depois: { tecnico_id: novo.tecnico_id },
        alteradoPor: req.user.id,
      });
    }
    return res.status(201).json({ ...novo, ja_existia: false });
  } catch (err) {
    console.error("[operador] POST /orcamentos/:id/chamado:", err);
    return res.status(500).json({ error: "Erro ao abrir o chamado deste orçamento" });
  }
});

/**
 * POST   /operador/orcamentos/:id/executado   — marca como feito
 * DELETE /operador/orcamentos/:id/executado   — desfaz
 *
 * O quarto estado da tela "Aprovados": o serviço foi feito **sem chamado
 * nenhum**. Migration 080.
 *
 * ⚠️ NÃO ACEITA DATA NEM AUTOR DO CORPO. `executado_em` é `NOW()` e
 * `executado_por` é quem está logado. Deixar o front mandar transformaria um
 * registro de atendimento em campo livre — e o valor dele é justamente ser
 * carimbo, não digitação.
 *
 * ⚠️ E NÃO MEXE EM `status`, que continua `aprovado`. Ver o comentário da
 * migration: "executado" é fato do atendimento, não estado do documento.
 *
 * ⚠️ O DELETE existe porque a marcação é de um clique e sem confirmação —
 * essa é a troca. Confirmação a cada marcação cobra de todo mundo o preço do
 * erro de alguns; desfazer cobra só de quem errou. Sem ele, a única saída de
 * um clique errado seria mexer no banco.
 */
router.post("/orcamentos/:id/executado", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0)
    return res.status(400).json({ error: "Orçamento inválido" });
  try {
    // ⚠️ `COALESCE(executado_em, NOW())`: marcar duas vezes não reescreve a
    // data da primeira. É a mesma regra de `primeira_resposta_em` no SLA
    // (chamados-sla.md) — a primeira escrita ganha.
    const r = await pool.query(
      `UPDATE orcamentos
          SET executado_em  = COALESCE(executado_em, NOW()),
              executado_por = COALESCE(executado_por, $2)
        WHERE id = $1 AND status = 'aprovado'
        RETURNING id, executado_em`,
      [id, req.user.id]
    );
    if (!r.rows.length)
      return res.status(404).json({ error: "Orçamento aprovado não encontrado" });
    return res.json(r.rows[0]);
  } catch (err) {
    console.error("[operador] POST /orcamentos/:id/executado:", err);
    return res.status(500).json({ error: "Erro ao marcar o orçamento como feito" });
  }
});

router.delete("/orcamentos/:id/executado", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0)
    return res.status(400).json({ error: "Orçamento inválido" });
  try {
    const r = await pool.query(
      `UPDATE orcamentos
          SET executado_em = NULL, executado_por = NULL
        WHERE id = $1
        RETURNING id`,
      [id]
    );
    if (!r.rows.length)
      return res.status(404).json({ error: "Orçamento não encontrado" });
    return res.json({ id: r.rows[0].id, executado_em: null });
  } catch (err) {
    console.error("[operador] DELETE /orcamentos/:id/executado:", err);
    return res.status(500).json({ error: "Erro ao desfazer" });
  }
});

module.exports = { operadorRouter: router };
