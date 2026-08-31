// src/services/chamado-atribuicao.service.js
//
// Uma pergunta só: **este técnico pode receber um chamado agora?**
//
// Existe como serviço, e não copiada nos dois routers, porque a resposta é a
// mesma nos DOIS lugares em que se atribui técnico na criação — `POST
// /chamados` (o "Novo chamado" do operador) e `POST
// /operador/orcamentos/:id/chamado` (a tela Aprovados) — e porque a regra é de
// NEGÓCIO, não de rota: quem aparece na lista de despacho é quem está `ativo`
// e tem `cargo = 'tecnico'`. Copiada, ela divergiria no primeiro ajuste, e o
// sintoma seria dos piores: uma tela oferecendo um técnico que a outra recusa.
//
// ⚠️ A FK de `chamados.tecnico_id` já barraria um id inexistente — com 23503,
// que o handler traduz em 500 "Erro ao criar chamado". Isto aqui existe para o
// caso comum não passar por lá: a lista da tela pode estar velha (o técnico
// saiu do quadro entre a carga e o clique), e "Este técnico não está mais
// disponível" é uma frase que o operador resolve sozinho. FK é rede de
// segurança, não mensagem de erro.
//
// ⚠️ NÃO checa `disponivel`. Ocupado não é impedimento — o diálogo de despacho
// mostra e deixa escolher, e num P1 às 18h quem está ocupado às vezes é quem
// está mais perto. `disponivel` informa a decisão; não a proíbe.

const { pool } = require("../db");

/**
 * @param {*} bruto  o que veio do corpo da request (aceita null/undefined/"" )
 * @returns {Promise<{ok: true, id: number|null} | {ok: false, erro: string}>}
 *   `id: null` = o operador não escolheu ninguém, que é um caso válido: o
 *   chamado nasce na fila esperando despacho, como sempre nasceu.
 */
async function resolverTecnico(bruto) {
  if (bruto === undefined || bruto === null || bruto === "") return { ok: true, id: null };

  const id = Number(bruto);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, erro: "tecnico_id inválido" };

  const r = await pool.query(
    `SELECT id FROM tecnicos
      WHERE id = $1 AND ativo = true AND COALESCE(cargo, 'tecnico') = 'tecnico'
      LIMIT 1`,
    [id]
  );
  if (!r.rows.length)
    return { ok: false, erro: "Este técnico não está mais disponível. Recarregue a tela." };

  return { ok: true, id };
}

module.exports = { resolverTecnico };
