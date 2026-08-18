// Reflexo do orçamento na bomba que está na bancada.
//
// Sem isto, o ciclo fica meio ligado: o técnico pede o orçamento pela ficha, o
// comercial aprova no painel, e a bomba continua eternamente "aguardando
// orçamento" para quem olha a bancada. Quem decide o destino da bomba é a
// resposta do cliente, e ela chega pelo orçamento.
//
// Chamado pelo PATCH de orçamentos avulsos. Falha aqui NUNCA derruba a
// atualização do orçamento: o documento comercial é a fonte da verdade, o
// estado do equipamento é consequência. Por isso o erro é logado, não lançado.

const { pool } = require("../db");

// status do orçamento → o que acontece com o equipamento
const REFLEXO = {
  aprovado: {
    tipo: "orcamento_aprovado",
    statusEquipamento: "em_conserto",
    texto: (n) => `Orçamento ${n} aprovado — liberado para conserto.`,
  },
  // Rejeitado devolve a bomba para a bancada em vez de deixá-la esperando uma
  // resposta que já veio: ela continua parada, mas agora aguardando decisão de
  // devolver sem conserto, não aguardando o cliente.
  rejeitado: {
    tipo: "anotacao",
    statusEquipamento: "oficina",
    texto: (n) => `Orçamento ${n} recusado pelo cliente.`,
  },
};

/**
 * @param {number} orcamentoId
 * @param {string} statusNovo  status para o qual o orçamento foi movido
 * @param {{id: number}} usuario  quem mudou
 */
async function refletirStatusOrcamento(orcamentoId, statusNovo, usuario) {
  const reflexo = REFLEXO[statusNovo];
  if (!reflexo) return; // rascunho/enviado não mexem no equipamento

  try {
    const r = await pool.query(
      `SELECT o.equipamento_id, o.numero, o.condominio_id, e.status AS status_atual
         FROM orcamentos o
         JOIN equipamentos e ON e.id = o.equipamento_id
        WHERE o.id = $1`,
      [orcamentoId]
    );
    if (!r.rows.length) return; // orçamento sem equipamento — nada a fazer
    const { equipamento_id, numero, condominio_id, status_atual } = r.rows[0];

    // Bomba já devolvida ou baixada não volta para a bancada porque um
    // orçamento antigo mudou de status.
    if (["instalado", "devolvido", "baixado"].includes(status_atual)) return;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO equipamento_movimentacoes
           (equipamento_id, tipo, status_novo, orcamento_id, condominio_id,
            usuario_id, usuario_nome, observacao)
         VALUES ($1, $2, $3, $4, $5, $6, (SELECT nome FROM usuarios WHERE id = $6), $7)`,
        [equipamento_id, reflexo.tipo, reflexo.statusEquipamento, orcamentoId,
         condominio_id, usuario?.id || null, reflexo.texto(numero)]
      );
      await client.query(
        `UPDATE equipamentos SET status = $1, atualizado_em = NOW() WHERE id = $2`,
        [reflexo.statusEquipamento, equipamento_id]
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[equipamento-bancada] refletirStatusOrcamento:", err);
  }
}

module.exports = { refletirStatusOrcamento };
