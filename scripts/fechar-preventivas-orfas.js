#!/usr/bin/env node
// Fecha chamados de preventiva que ficaram abertos depois de a visita ter
// acontecido por outro chamado (a "preventiva aproveitada").
//
// ⚠️ ONE-OFF de 21/09/2026, para a sujeira que o bug deixou. O bug em si está
// corrigido em `src/services/preventivas.service.js` (o chamado passa a fechar
// mesmo quando o ciclo do plano já avançou na abertura) — este script só
// limpa o que ficou para trás. Ele é idempotente: rodar duas vezes não muda
// nada, porque só toca chamado que ainda está aberto.
//
// O critério é o mesmo do bug, e é conservador de propósito:
//   · O.S. FINALIZADA no mês, com `preventiva_mensal` nos tipos de serviço;
//   · no mesmo condomínio, um chamado de preventiva AINDA ABERTO;
//   · e esse chamado NÃO é o da própria O.S. (esse já fecha sozinho).
//
// ⚠️ NÃO MEXE NAS DATAS DO PLANO. Quem as moveu foi a abertura do chamado
// (`executarPlano` grava `ultima_em`/`proxima_em` ao ABRIR); mexer de novo
// pularia um mês. Aqui só se fecha o chamado que esperava a visita.
//
// ⚠️ O chamado fecha no instante da O.S., não em NOW(): o `tempo_resolucao_seg`
// É o SLA, e carimbar hoje contaria como atendimento os dias em que o chamado
// ficou esquecido. Mesma razão do `quando` em POST /ordens-servico/:id/finalizar.
//
// ⚠️ O ALVO PADRÃO É O BANCO DE TESTE, como em todo o resto do projeto fora de
// produção (`src/db-url.js`). A sujeira que motivou este script está em
// PRODUÇÃO — para lá, `--producao`, explícito e nunca por acidente.
//
// Uso:  node scripts/fechar-preventivas-orfas.js                        (simulação, teste)
//       node scripts/fechar-preventivas-orfas.js --producao             (simulação, prod)
//       node scripts/fechar-preventivas-orfas.js --producao --aplicar   (grava em prod)
require("dotenv").config();
const { Pool } = require("pg");
const { resolverDatabaseUrl, descreverAlvo } = require("../src/db-url");

const APLICAR = process.argv.includes("--aplicar");
const PRODUCAO = process.argv.includes("--producao");
const COMPETENCIA = process.argv.find((a) => /^\d{4}-\d{2}$/.test(a)) || "2026-09";

const { url, alvo } = resolverDatabaseUrl({ forcarProducao: PRODUCAO });
console.log(`🗄️  Banco: ${alvo} — ${descreverAlvo(url)}`);
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function main() {
  const inicio = `${COMPETENCIA}-01`;

  const { rows } = await pool.query(
    `SELECT DISTINCT ON (ch.id)
            ch.id            AS chamado_id,
            ch.criado_em     AS chamado_criado_em,
            os.id            AS os_id,
            os.numero        AS os_numero,
            os.finalizada_em AS quando,
            pm.id            AS plano_id,
            pm.ultima_os_id  AS plano_ultima_os_id,
            ch.status        AS chamado_status,
            COALESCE(NULLIF(c.nome_fantasia,''), c.nome) AS condominio
       FROM ordens_servico os
       JOIN condominios c        ON c.id  = os.condominio_id
       JOIN planos_manutencao pm ON pm.condominio_id = os.condominio_id AND pm.ativo
       JOIN chamados ch          ON ch.plano_manutencao_id = pm.id
      WHERE os.finalizada_em >= $1::date
        AND os.finalizada_em <  ($1::date + INTERVAL '1 month')
        AND os.tipos_servico @> ARRAY['preventiva_mensal']::text[]
        AND ch.id <> COALESCE(os.chamado_id, -1)
        AND (
          ch.status NOT IN ('fechado','cancelado')
          -- ⚠️ E TAMBEM O QUE JA FECHOU SEM TRILHA (21/09/2026). A primeira
          -- passada deste script fechou 4 chamados e NAO gravou ultima_os_id:
          -- a placa passou a dizer "Feita" sem O.S. e sem tecnico, que e o que
          -- o Pedro viu na tela. Regra dele: preventiva fechada tem origem,
          -- ponto. Estas linhas so recebem o ponteiro, nada mais.
          --
          -- ⚠️ AS TRES CONDICOES JUNTAS, e nenhuma e decorativa: sem
          -- "fechado NESTA competencia" entraria chamado de ciclo antigo; sem
          -- "sem O.S. propria" entraria a preventiva feita pelo caminho normal,
          -- que ja tem trilha melhor (a O.S. do proprio chamado); e sem
          -- "ultima_os_id IS NULL" o script sobrescreveria uma trilha existente.
          OR (ch.status = 'fechado'
              AND ch.fechado_em >= $1::date
              AND ch.fechado_em <  ($1::date + INTERVAL '1 month')
              AND pm.ultima_os_id IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM ordens_servico osp WHERE osp.chamado_id = ch.id))
        )
      ORDER BY ch.id, os.finalizada_em DESC`,
    [inicio]
  );

  if (rows.length === 0) {
    console.log(`Nenhum chamado de preventiva órfão em ${COMPETENCIA}.`);
    return;
  }

  console.log(`${rows.length} preventiva(s) a acertar em ${COMPETENCIA}:\n`);
  for (const r of rows) {
    const acao = r.chamado_status === "fechado"
      ? "só grava a trilha (chamado já estava fechado)"
      : "fecha o chamado e grava a trilha";
    console.log(
      `  #${r.chamado_id}  plano ${r.plano_id}  ${r.condominio}` +
      `\n      aberto em ${String(r.chamado_criado_em).slice(0, 10)}` +
      `  ·  ${r.os_numero} (${String(r.quando).slice(0, 10)})` +
      `\n      ${acao}`
    );
  }

  if (!APLICAR) {
    console.log("\nSimulação. Rode com --aplicar para gravar.");
    return;
  }

  // ⚠️ SNAPSHOT ANTES DE ESCREVER. Fechar um chamado é reversível, mas só se
  // alguém ainda souber como ele estava: `fechado_em`, `primeira_resposta_em` e
  // `tempo_resolucao_seg` são sobrescritos e não se reconstroem de memória. O
  // arquivo fica em `uploads/` e o caminho é impresso no fim.
  const fs = require("fs");
  const path = require("path");
  const snapDir = path.join(__dirname, "..", "uploads");
  fs.mkdirSync(snapDir, { recursive: true });
  const snapPath = path.join(
    snapDir, `preventivas-orfas-${COMPETENCIA}-${Date.now()}.json`);

  const client = await pool.connect();
  const snapshot = [];
  try {
    await client.query("BEGIN");
    for (const r of rows) {
      const antes = await client.query(
        `SELECT status, prioridade, categoria, responsavel_id, tecnico_id, condominio_id,
                fechado_em, primeira_resposta_em, tempo_resolucao_seg, atualizado_em
           FROM chamados WHERE id = $1 FOR UPDATE`,
        [r.chamado_id]
      );
      if (antes.rows.length === 0) continue;
      snapshot.push({
        chamado_id: r.chamado_id,
        os: r.os_numero,
        antes: antes.rows[0],
        plano_id: r.plano_id,
        plano_ultima_os_id_antes: r.plano_ultima_os_id,
      });
      fs.writeFileSync(snapPath, JSON.stringify(snapshot, null, 2), "utf8");

      // ⚠️ A TRILHA, SEMPRE — é a razão desta segunda passada. `ultima_os_id`
      // SOZINHO: é ponteiro de trilha, não de ciclo, e mexer em
      // `ultima_em`/`proxima_em` aqui pularia um mês. O `IS NULL` no WHERE
      // garante que uma trilha já existente nunca é sobrescrita.
      await client.query(
        `UPDATE planos_manutencao
            SET ultima_os_id = $1
          WHERE id = $2 AND ultima_os_id IS NULL`,
        [r.os_id, r.plano_id]
      );

      // Chamado já fechado (a primeira passada fechou): só a trilha faltava.
      if (r.chamado_status === "fechado") {
        console.log(`  ✓ #${r.chamado_id} trilha gravada (${r.os_numero}).`);
        continue;
      }

      await client.query(
        `UPDATE chamados
            SET status = 'fechado',
                -- GREATEST(..., criado_em): a OS-2026-0020 foi finalizada em
                -- 02/09 e o job só abriu o chamado em 04/09 (a preventiva do
                -- mês já estava feita quando ele nasceu). Carimbar a data da
                -- O.S. deixaria fechado_em ANTES de criado_em.
                -- (Sem crase nos comentarios: template literal. Ver CLAUDE.md.)
                fechado_em = GREATEST(COALESCE($2::timestamptz, NOW()), criado_em),
                primeira_resposta_em = COALESCE(
                  primeira_resposta_em, GREATEST(COALESCE($2::timestamptz, NOW()), criado_em)),
                tempo_resolucao_seg = GREATEST(0, EXTRACT(EPOCH FROM (
                  GREATEST(COALESCE($2::timestamptz, NOW()), criado_em) - criado_em))::int),
                atualizado_em = NOW()
          WHERE id = $1
            AND status NOT IN ('fechado','cancelado')`,
        [r.chamado_id, r.quando]
      );
      // O mesmo audit log do `chamado-historico.service` — inline porque
      // aquele módulo carrega `src/db`, que abriria um pool no banco de TESTE
      // e imprimiria um alvo enganoso num script que escreve em produção.
      // `alterado_por` é NULL: a visita está na O.S., não em quem rodou isto.
      await client.query(
        `INSERT INTO historico_chamados
           (chamado_id, campo_alterado, valor_anterior, valor_novo, alterado_por)
         VALUES ($1, 'status', $2, 'fechado', NULL)`,
        [r.chamado_id, antes.rows[0].status]
      );
      console.log(`  ✓ #${r.chamado_id} fechado (${r.os_numero}).`);
    }
    await client.query("COMMIT");
    console.log(`\n${rows.length} chamado(s) fechado(s).`);
    console.log(`Estado anterior salvo em: ${snapPath}`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error(e);
    pool.end();
    process.exit(1);
  });
