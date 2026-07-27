// Popula o banco de TESTE com o mínimo pra usar o sistema: um admin, um
// técnico (com login no app), condomínios com zona e coordenada, planos de
// manutenção em vários estágios de vencimento e o responsável da Zona Sul.
//
// Uso:  node scripts/seed-teste.js
//
// Recusa rodar em produção — o alvo vem do mesmo resolvedor do servidor
// (src/db-url.js), e o script aborta se ele devolver "PRODUÇÃO".
//
// É idempotente: identifica o que criou por chaves naturais (e-mail do
// usuário, nome do condomínio, título do plano) e não duplica se rodar de novo.

require("dotenv").config();

const bcrypt = require("bcrypt");
const { Pool } = require("pg");
const { resolverDatabaseUrl, descreverAlvo } = require("../src/db-url");

const SENHA_PADRAO = "teste123";

// Coordenadas reais de bairros de SP — o roteiro ordena por distância, então
// dados sem lat/lng não exercitariam a tela.
const CONDOMINIOS = [
  { nome: "Ed. Aurora",        zona: "Zona Sul",   bairro: "Moema",        lat: -23.6018, lng: -46.6653 },
  { nome: "Ed. Bosque Verde",  zona: "Zona Sul",   bairro: "Campo Belo",   lat: -23.6194, lng: -46.6742 },
  { nome: "Residencial Ipê",   zona: "Zona Sul",   bairro: "Santo Amaro",  lat: -23.6540, lng: -46.7080 },
  { nome: "Ed. Mirante",       zona: "Zona Sul",   bairro: "Vila Mariana", lat: -23.5893, lng: -46.6350 },
  { nome: "Condomínio Solar",  zona: "Zona Oeste", bairro: "Pinheiros",    lat: -23.5640, lng: -46.7020 },
];

// dias: quando vence, relativo a hoje. Cobre os 4 estados da aba Planos.
const PLANOS = [
  { condo: "Ed. Aurora",       titulo: "Limpeza de caixa d'água", periodicidade: 180, dias: -6 },
  { condo: "Ed. Aurora",       titulo: "Revisão da bomba",        periodicidade: 90,  dias: -6 },
  { condo: "Ed. Bosque Verde", titulo: "Limpeza de caixa d'água", periodicidade: 180, dias: 0  },
  { condo: "Residencial Ipê",  titulo: "Inspeção elétrica",       periodicidade: 365, dias: 3  },
  { condo: "Residencial Ipê",  titulo: "Limpeza de caixa d'água", periodicidade: 180, dias: 5  },
  { condo: "Ed. Mirante",      titulo: "Revisão da bomba",        periodicidade: 90,  dias: 20 },
  { condo: "Condomínio Solar", titulo: "Limpeza de caixa d'água", periodicidade: 180, dias: 2  },
];

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
  console.log(`→ Semeando ${alvo} — ${descreverAlvo(url)}\n`);

  try {
    const hash = await bcrypt.hash(SENHA_PADRAO, 10);

    // ─── Usuários ───────────────────────────────────────────────────────────
    async function upsertUsuario(nome, email, role) {
      const existe = await pool.query("SELECT id FROM usuarios WHERE email = $1", [email]);
      if (existe.rows.length) {
        // Repõe a senha: útil quando se esquece qual era a do seed anterior.
        await pool.query("UPDATE usuarios SET senha_hash = $1, role = $2 WHERE id = $3",
          [hash, role, existe.rows[0].id]);
        return existe.rows[0].id;
      }
      const r = await pool.query(
        "INSERT INTO usuarios (nome, email, senha_hash, role) VALUES ($1,$2,$3,$4) RETURNING id",
        [nome, email, hash, role]
      );
      return r.rows[0].id;
    }

    const adminId = await upsertUsuario("Admin Teste", "admin@teste.local", "admin");

    // Dois técnicos: a operação manda dupla pra rodar as preventivas de uma
    // região, e desde a migration 066 os dois podem responder pela mesma zona.
    async function upsertTecnico(nome, email, telefone, especialidade) {
      const uid = await upsertUsuario(nome, email, "tecnico");
      const existe = await pool.query("SELECT id FROM tecnicos WHERE usuario_id = $1", [uid]);
      if (existe.rows.length) return existe.rows[0].id;
      const r = await pool.query(
        `INSERT INTO tecnicos (nome, email, telefone, especialidade, cargo, ativo, disponivel, usuario_id)
         VALUES ($1,$2,$3,$4,'tecnico',TRUE,TRUE,$5) RETURNING id`,
        [nome, email, telefone, especialidade, uid]
      );
      return r.rows[0].id;
    }

    const tecnicoId  = await upsertTecnico("Carlos Técnico", "tecnico@teste.local",  "11999990000", "Hidráulica");
    const tecnicoId2 = await upsertTecnico("Marina Técnica", "tecnico2@teste.local", "11999990001", "Elétrica");
    console.log(`✓ usuários: admin@teste.local · tecnico@teste.local · tecnico2@teste.local`);
    console.log(`✓ técnicos #${tecnicoId} e #${tecnicoId2} vinculados ao login do app`);

    // ─── Condomínios ────────────────────────────────────────────────────────
    const idPorNome = {};
    for (const c of CONDOMINIOS) {
      const existe = await pool.query("SELECT id FROM condominios WHERE nome = $1", [c.nome]);
      if (existe.rows.length) {
        idPorNome[c.nome] = existe.rows[0].id;
        await pool.query(
          "UPDATE condominios SET zona=$1, lat=$2, lng=$3, ativo=TRUE WHERE id=$4",
          [c.zona, c.lat, c.lng, existe.rows[0].id]
        );
        continue;
      }
      const r = await pool.query(
        `INSERT INTO condominios (nome, endereco, bairro, cidade, uf, zona, lat, lng, ativo, email, responsavel, telefone)
         VALUES ($1,$2,$3,'São Paulo','SP',$4,$5,$6,TRUE,$7,$8,$9) RETURNING id`,
        [c.nome, `Rua Exemplo, ${100 + CONDOMINIOS.indexOf(c) * 37}`, c.bairro, c.zona,
         c.lat, c.lng, "sindico@teste.local", "Síndico Teste", "1133330000"]
      );
      idPorNome[c.nome] = r.rows[0].id;
    }
    console.log(`✓ ${CONDOMINIOS.length} condomínios (com zona e coordenada)`);

    // ─── Planos de manutenção ───────────────────────────────────────────────
    let novos = 0;
    for (const p of PLANOS) {
      const condoId = idPorNome[p.condo];
      const existe = await pool.query(
        "SELECT id FROM planos_manutencao WHERE condominio_id = $1 AND titulo = $2",
        [condoId, p.titulo]
      );
      if (existe.rows.length) {
        await pool.query(
          `UPDATE planos_manutencao
           SET periodicidade_dias=$1, proxima_em = CURRENT_DATE + $2::int, ativo=TRUE
           WHERE id=$3`,
          [p.periodicidade, p.dias, existe.rows[0].id]
        );
        continue;
      }
      await pool.query(
        `INSERT INTO planos_manutencao
           (condominio_id, titulo, descricao, periodicidade_dias, proxima_em, ativo, criado_por)
         VALUES ($1,$2,$3,$4, CURRENT_DATE + $5::int, TRUE, $6)`,
        [condoId, p.titulo, "Plano criado pelo seed de teste.", p.periodicidade, p.dias, adminId]
      );
      novos++;
    }
    console.log(`✓ ${PLANOS.length} planos (${novos} novos) — vencidos, vencendo e em dia`);

    // ─── Responsável de zona (é o que faz o Roteiro aparecer no app) ────────
    // A dupla que sai junta pra Zona Sul — os dois enxergam o mesmo roteiro.
    await pool.query(
      `INSERT INTO planos_zona_responsavel (zona, tecnico_id, atualizado_em)
       SELECT 'Zona Sul', id, NOW() FROM unnest($1::int[]) AS id
       ON CONFLICT (zona, tecnico_id) DO UPDATE SET atualizado_em = NOW()`,
      [[tecnicoId, tecnicoId2]]
    );
    console.log(`✓ Zona Sul → Carlos + Marina (Zona Oeste ficou sem responsável de propósito)`);

    // ─── Configurações do ambiente de teste ─────────────────────────────────
    // Sem janela de expediente: em teste você mexe no app a qualquer hora, e
    // "Fora do expediente (08h–18h)" desligaria o GPS e poluiria a tela.
    // Como isto vive no banco, produção (outro banco) segue em 08–18.
    // E a geração automática de chamado fica DESLIGADA: com o Roteiro, o P4 só
    // nasce quando alguém toca "Iniciar" no prédio. Sem isso o job despejaria
    // preventivas no app de quem talvez nem saia hoje.
    for (const [chave, valor] of [
      ["gps.expediente_inicio", "0"],
      ["gps.expediente_fim", "24"],
      ["planos.geracao_enabled", "false"],
    ]) {
      await pool.query(
        `INSERT INTO configuracoes (chave, valor, atualizado_em, atualizado_por)
         VALUES ($1, $2, NOW(), $3)
         ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = NOW()`,
        [chave, valor, adminId]
      );
    }
    console.log(`✓ expediente do GPS desligado neste banco (00h–24h)`);

    console.log(`\n  Login:  admin@teste.local  /  ${SENHA_PADRAO}`);
    console.log(`          tecnico@teste.local /  ${SENHA_PADRAO}`);
  } catch (err) {
    console.error("✗ Erro:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
