const { pool } = require("../db");

// Mensagem única pros dois casos em que o condomínio não vale mais: soft delete
// (`ativo = false`) e id que não existe mais (JWT antigo apontando pra um
// condomínio que sofreu hard delete). Do ponto de vista do cliente é a mesma
// coisa — o cadastro dele foi encerrado.
const MSG_INATIVO =
  "Acesso desativado: o cadastro deste condomínio foi encerrado. " +
  "Fale com a administradora.";

/**
 * Restringe a rota ao role `cliente` e valida que o condomínio dele ainda está
 * ativo.
 *
 * ⚠️ O check do condomínio é feito **a cada request**, não só no login. O JWT
 * vale 7 dias e carrega o `condominio_id` de quando foi emitido — se a
 * revogação só existisse no login, um cliente já logado continuaria com acesso
 * por até uma semana depois do soft delete. É o custo de um SELECT por PK.
 */
async function clienteOnly(req, res, next) {
  if (req.user?.role !== "cliente") {
    return res.status(403).json({ error: "Acesso restrito (cliente)" });
  }

  const condominioId = Number(req.user.condominio_id);

  // Sem vínculo nenhum: deixa seguir para o handler, que já responde
  // "Cliente sem condomínio vinculado". Barrar aqui daria a mensagem errada
  // (falaria em cadastro encerrado, quando na verdade nunca houve vínculo).
  if (!condominioId) return next();

  try {
    const r = await pool.query(
      "SELECT ativo FROM condominios WHERE id = $1 LIMIT 1",
      [condominioId]
    );
    if (r.rows.length === 0 || r.rows[0].ativo === false) {
      return res.status(403).json({ error: MSG_INATIVO });
    }
    return next();
  } catch (err) {
    console.error("Erro em clienteOnly:", err);
    return res.status(500).json({ error: "Erro ao validar acesso" });
  }
}

module.exports = { clienteOnly, MSG_INATIVO };
