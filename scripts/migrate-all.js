// Script de bootstrap de banco — roda o schema base + TODAS as migrations
// numeradas, em ordem, contra um banco vazio (ex.: o de teste no Railway).
//
// O migrate.js roda um arquivo por vez, o que é certo pro dia a dia mas
// inviável pra montar um banco do zero (são 60+ arquivos).
//
// Uso:
//   node scripts/migrate-all.js                      → usa DATABASE_URL_TESTE do .env
//   node scripts/migrate-all.js --url "postgres://…"  → alvo explícito
//   node scripts/migrate-all.js --dry-run             → só lista o que rodaria
//   node scripts/migrate-all.js --yes                 → pula a confirmação
//
// Segurança: nunca cai em DATABASE_URL (produção) sem você pedir com --url.
// Antes de escrever qualquer coisa, mostra host/banco e exige confirmação.

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { Pool } = require("pg");

const RAIZ        = path.resolve(__dirname, "..");
const SCHEMA_SQL  = path.join(RAIZ, "database", "schema.sql");
const DIR_MIGR    = path.join(RAIZ, "migrations");

// ─── Args ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { url: null, dryRun: false, yes: false, skipSchema: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run")      out.dryRun = true;
    else if (a === "--yes")     out.yes = true;
    else if (a === "--force")   out.force = true;
    else if (a === "--skip-schema") out.skipSchema = true;
    else if (a.startsWith("--url=")) out.url = a.slice(6);
    else if (a === "--url")     out.url = argv[++i];
  }
  return out;
}

function mascarar(url) {
  return String(url).replace(/:[^:@/]+@/, ":***@");
}

// Identidade real de um alvo. Na Railway TODO banco se chama "railway" por
// dentro, então nome de banco não distingue produção de teste — host+porta sim.
function identidade(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port}${u.pathname}`;
  } catch {
    return null;
  }
}

// Só arquivos NNN_nome.sql entram na sequência. `limpar-dados-teste.sql` e
// `restaurar-defaults.sql` ficam de fora de propósito: são utilitários que se
// roda à mão, não passos da evolução do schema.
function listarMigrations() {
  return fs.readdirSync(DIR_MIGR)
    .filter(f => /^\d+_.*\.sql$/i.test(f))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b));
}

// O pg_dump 17+ embute meta-comandos do psql (\restrict / \unrestrict) no
// começo e no fim do arquivo — é o caso do database/schema.sql. O driver `pg`
// fala o protocolo do Postgres, não é o psql, então engasga neles. Tiramos só
// esses comandos (allowlist), pra não arriscar mexer em SQL de verdade.
function limparMetaPsql(sql) {
  return sql.replace(/^[ \t]*\\(restrict|unrestrict|connect|c)\b.*$/gim, "");
}

function confirmar(pergunta) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(pergunta, resp => { rl.close(); resolve(resp.trim()); }));
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url  = args.url || process.env.DATABASE_URL_TESTE;

  const migrations = listarMigrations();
  const ignorados  = fs.readdirSync(DIR_MIGR).filter(f => f.endsWith(".sql") && !/^\d+_/.test(f));

  if (args.dryRun) {
    console.log(`→ ${migrations.length} migrations seriam aplicadas, nesta ordem:\n`);
    migrations.forEach((f, i) => console.log(`  ${String(i + 1).padStart(2)}. ${f}`));
    if (ignorados.length) console.log(`\n→ Fora da sequência (rodar à mão se precisar): ${ignorados.join(", ")}`);
    console.log(`\n→ Antes de tudo: database/schema.sql (só se o banco estiver vazio)`);
    return;
  }

  if (!url) {
    console.error("Nenhum banco de destino informado.\n");
    console.error("Defina DATABASE_URL_TESTE no .env ou passe --url \"postgres://…\".");
    console.error("(DATABASE_URL não é usada aqui de propósito — é o banco de produção.)");
    process.exit(1);
  }

  // Trava principal: se o alvo for o mesmo host/porta/banco da DATABASE_URL,
  // é produção — não importa o que esteja escrito no nome da variável.
  const idAlvo = identidade(url);
  const idProd = process.env.DATABASE_URL ? identidade(process.env.DATABASE_URL) : null;
  if (idAlvo && idProd && idAlvo === idProd && !args.force) {
    console.error("✗ ABORTADO: o destino é o MESMO banco da DATABASE_URL (produção).");
    console.error(`  ${idAlvo}`);
    console.error("\n  Na Railway todo banco se chama \"railway\" — o que muda é o host.");
    console.error("  Confira se você copiou a DATABASE_PUBLIC_URL do serviço de teste.");
    console.error("  (Se for intencional mesmo, existe --force.)");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

  try {
    const info = await pool.query("SELECT current_database() AS db, current_user AS usr");
    const { db, usr } = info.rows[0];

    const tabelas = await pool.query(
      `SELECT COUNT(*)::int AS n FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    const jaTemSchema = await pool.query(
      `SELECT to_regclass('public.condominios') IS NOT NULL AS existe`
    );

    console.log(`→ Destino:  ${mascarar(url)}`);
    console.log(`→ Conectado em "${db}" como "${usr}"`);
    console.log(`→ Tabelas hoje: ${tabelas.rows[0].n}`);
    console.log(`→ Migrations a aplicar: ${migrations.length}\n`);

    // schema.sql usa CREATE TABLE puro (não é idempotente) — rodar num banco
    // que já tem as tabelas base explode. Por isso só roda no banco vazio.
    const rodarSchema = !args.skipSchema && !jaTemSchema.rows[0].existe;
    if (!rodarSchema) {
      console.log(args.skipSchema
        ? "· schema.sql: pulado (--skip-schema)"
        : "· schema.sql: pulado (tabelas base já existem)");
    }

    if (!args.yes) {
      // Via `npm run` no PowerShell o stdin costuma não ser TTY: o prompt
      // receberia EOF na hora e pareceria "cancelou sozinho". Melhor dizer o
      // que fazer do que fingir que perguntou.
      if (!process.stdin.isTTY) {
        console.error("\nNão dá pra pedir confirmação: a entrada não é interativa.");
        console.error("Rode de novo com --yes, ou chame o node direto:");
        console.error("  npm run migrate:all -- --yes");
        console.error("  node scripts/migrate-all.js");
        process.exitCode = 1;
        return;
      }
      // Não peço o nome do banco: na Railway é sempre "railway", nos dois
      // ambientes. A separação de verdade é a trava de host lá em cima.
      const resp = await confirmar(`\nAplicar em ${idAlvo || db}? Digite CONFIRMAR: `);
      if (resp.toUpperCase() !== "CONFIRMAR") {
        console.log(`Cancelado — nada foi executado.`);
        return;
      }
      console.log();
    }

    const arquivos = [
      ...(rodarSchema ? [{ nome: "database/schema.sql", caminho: SCHEMA_SQL }] : []),
      ...migrations.map(f => ({ nome: f, caminho: path.join(DIR_MIGR, f) })),
    ];

    let ok = 0;
    const t0 = Date.now();

    // Uma conexão dedicada pro lote inteiro: o schema.sql (dump do pg_dump)
    // termina com `set_config('search_path', '', false)`, que vale pra SESSÃO.
    // Sem repor o search_path, a migration seguinte falha com "no schema has
    // been selected to create in". Repomos antes de cada arquivo.
    const client = await pool.connect();
    try {
      for (const arq of arquivos) {
        const sql = limparMetaPsql(fs.readFileSync(arq.caminho, "utf8"));
        const inicio = Date.now();
        try {
          await client.query("SET search_path TO public");
          // Sem transação externa: várias migrations já trazem BEGIN/COMMIT
          // próprios, e aninhar quebraria o controle delas.
          await client.query(sql);
          ok++;
          console.log(`✓ ${arq.nome.padEnd(46)} ${Date.now() - inicio}ms`);
        } catch (err) {
          console.error(`\n✗ Falhou em ${arq.nome}`);
          console.error(`  ${err.message}`);
          if (err.position) console.error(`  posição: ${err.position}`);
          console.error(`\n${ok} arquivo(s) aplicado(s) antes da falha. Corrija e rode de novo —`);
          console.error("as migrations são idempotentes, então repetir é seguro.");
          process.exitCode = 1;
          return;
        }
      }
    } finally {
      client.release();
    }

    const depois = await pool.query(
      `SELECT COUNT(*)::int AS n FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );

    console.log(`\n✓ ${ok} arquivo(s) aplicado(s) em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    console.log(`✓ Banco "${db}" agora tem ${depois.rows[0].n} tabelas`);
    if (ignorados.length) {
      console.log(`\n· Fora da sequência (rode à mão se quiser): ${ignorados.join(", ")}`);
    }
  } catch (err) {
    console.error("✗ Erro:", err.message);
    // Pegadinha clássica da Railway: a DATABASE_URL que ela mostra por padrão
    // aponta pra rede privada, que só resolve de dentro de um serviço dela.
    if (err.code === "ENOTFOUND" && /\.railway\.internal/.test(String(err.hostname || err.message))) {
      console.error("\n  Esse host é da rede interna da Railway — não resolve fora dela.");
      console.error("  Use a DATABASE_PUBLIC_URL do serviço (host *.proxy.rlwy.net).");
      console.error("  A interna só serve pra um deploy rodando dentro da própria Railway.");
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
