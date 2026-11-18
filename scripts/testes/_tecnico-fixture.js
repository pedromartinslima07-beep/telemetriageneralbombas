// Técnico descartável para teste de rota.
//
// ⚠️ POR QUE EXISTE (18/11/2026): os testes que exercitam a trava de "um
// atendimento por vez" pegavam o PRIMEIRO técnico ativo do banco de teste — o
// Carlos do seed, o mesmo que se usa para testar o app à mão. Bastou um
// chamado dele ficar "em atendimento" (a preventiva de setembro, com uma O.S.
// rascunho de 14/09) para `devolver-chamado` e `um-atendimento-por-vez`
// falharem por estado herdado, não por código. Falha por lixo esconde falha de
// verdade. Com um técnico só do teste, o estado de partida é sempre "livre".
//
// Usuário com senha_hash inválido de propósito: não dá para entrar com ele,
// só com o JWT que o teste assina.
//
// ⚠️ Tudo que aponta para `tecnicos` e `usuarios` é CASCADE ou SET NULL
// (conferido no information_schema em 18/11/2026), então apagar no fim é
// seguro. Se uma execução morrer no meio (timeout), o próximo `criar` varre os
// técnicos de teste com mais de uma hora.
const PREFIXO_EMAIL = "tec-fixture-";

async function criarTecnicoDeTeste(pool, rotulo) {
  await pool.query(
    `DELETE FROM tecnicos WHERE email LIKE $1 AND criado_em < NOW() - INTERVAL '1 hour'`,
    [PREFIXO_EMAIL + "%@teste.local"]
  ).catch(() => {});
  await pool.query(
    `DELETE FROM usuarios WHERE email LIKE $1 AND criado_em < NOW() - INTERVAL '1 hour'`,
    [PREFIXO_EMAIL + "%@teste.local"]
  ).catch(() => {});

  const suf = Date.now() + "-" + Math.floor(Math.random() * 1e6);
  const email = `${PREFIXO_EMAIL}${suf}@teste.local`;
  const nome = `Técnico TESTE (${rotulo})`;
  const u = await pool.query(
    "INSERT INTO usuarios (nome, email, senha_hash, role) VALUES ($1, $2, 'fixture-sem-login', 'tecnico') RETURNING id",
    [nome, email]
  );
  const t = await pool.query(
    `INSERT INTO tecnicos (nome, email, telefone, especialidade, cargo, ativo, disponivel, usuario_id)
     VALUES ($1, $2, '11900000000', 'geral', 'tecnico', TRUE, TRUE, $3) RETURNING id`,
    [nome, email, u.rows[0].id]
  );
  return { id: t.rows[0].id, usuarioId: u.rows[0].id };
}

async function apagarTecnicoDeTeste(pool, tec) {
  if (!tec) return;
  await pool.query("DELETE FROM tecnicos WHERE id = $1", [tec.id]).catch(e =>
    console.error("fixture: não apagou o técnico", tec.id, e.message));
  await pool.query("DELETE FROM usuarios WHERE id = $1", [tec.usuarioId]).catch(e =>
    console.error("fixture: não apagou o usuário", tec.usuarioId, e.message));
}

module.exports = { criarTecnicoDeTeste, apagarTecnicoDeTeste };
