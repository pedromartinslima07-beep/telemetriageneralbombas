const OpenAI = require("openai");
const { pool } = require("../db");
const { getConfig, getConfigBool } = require("./config.service");
const { registrarCriacao } = require("./chamado-historico.service");

let _client = null;
function getClient() {
  if (_client) return _client;
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY não configurada");
  _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

// ─── Funções disponíveis para a IA ───────────────────────────────────────────

async function buscarTelemetria({ condominio_id }) {
  const result = await pool.query(
    `SELECT
       r.nome AS reservatorio,
       l.nivel_pct,
       l.bomba_ligada,
       l.criado_em
     FROM reservatorios r
     LEFT JOIN LATERAL (
       SELECT nivel_pct, bomba_ligada, criado_em
       FROM leituras
       WHERE device_id = r.device_id
       ORDER BY criado_em DESC
       LIMIT 1
     ) l ON true
     WHERE r.condominio_id = $1 AND r.ativo = true`,
    [condominio_id]
  );
  return result.rows;
}

async function buscarChamadosAbertos({ condominio_id }) {
  const result = await pool.query(
    `SELECT id, titulo, prioridade, status, criado_em
     FROM chamados
     WHERE condominio_id = $1 AND status != 'fechado'
     ORDER BY criado_em DESC
     LIMIT 10`,
    [condominio_id]
  );
  return result.rows;
}

async function buscarCondominio({ nome, endereco }) {
  const termo = `%${(nome || endereco || "").toLowerCase()}%`;
  const result = await pool.query(
    `SELECT id, nome, endereco FROM condominios
     WHERE LOWER(nome) LIKE $1 OR LOWER(endereco) LIKE $1
     LIMIT 5`,
    [termo]
  );
  return result.rows;
}

async function vincularClienteCondominio({ cliente_whatsapp_id, condominio_id }) {
  await pool.query(
    `UPDATE clientes_whatsapp SET condominio_id = $1 WHERE id = $2`,
    [condominio_id, cliente_whatsapp_id]
  );
  return { ok: true };
}

async function abrirChamado({ conversa_id, condominio_id, titulo, descricao, prioridade, categoria }) {
  let descricaoFinal = descricao;

  // Anexa snapshot de telemetria se há condomínio vinculado
  if (condominio_id) {
    try {
      const tel = await buscarTelemetria({ condominio_id });
      if (tel.length > 0) {
        const linhas = tel.map(t =>
          `• ${t.reservatorio}: ${t.nivel_pct !== null ? t.nivel_pct + '%' : 'N/D'} | Bomba: ${t.bomba_ligada ? 'LIGADA' : 'DESLIGADA'}`
        ).join('\n');
        descricaoFinal += `\n\n📊 Telemetria no momento da abertura:\n${linhas}`;
      }
    } catch (_) { /* não bloqueia criação do chamado se telemetria falhar */ }
  }

  const result = await pool.query(
    `INSERT INTO chamados (conversa_id, condominio_id, titulo, descricao, prioridade, categoria)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [conversa_id, condominio_id || null, titulo, descricaoFinal, prioridade, categoria || 'outro']
  );
  // Audit log: alteradoPor=null sinaliza "criado pela IA" no histórico.
  registrarCriacao({ chamadoId: result.rows[0].id, alteradoPor: null });
  return { chamado_id: result.rows[0].id };
}

// ─── Definição das ferramentas para a OpenAI ─────────────────────────────────

const tools = [
  {
    type: "function",
    function: {
      name: "buscar_telemetria",
      description: "Busca o nível do reservatório e status da bomba do condomínio",
      parameters: {
        type: "object",
        properties: {
          condominio_id: { type: "integer", description: "ID do condomínio" },
        },
        required: ["condominio_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_chamados_abertos",
      description: "Lista chamados em aberto do condomínio",
      parameters: {
        type: "object",
        properties: {
          condominio_id: { type: "integer", description: "ID do condomínio" },
        },
        required: ["condominio_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_condominio",
      description: "Busca condomínios no sistema pelo nome ou endereço informado pelo cliente",
      parameters: {
        type: "object",
        properties: {
          nome:     { type: "string", description: "Nome do condomínio" },
          endereco: { type: "string", description: "Endereço ou rua do condomínio" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "vincular_cliente_condominio",
      description: "Vincula o cliente ao condomínio identificado para atendimentos futuros",
      parameters: {
        type: "object",
        properties: {
          cliente_whatsapp_id: { type: "integer" },
          condominio_id:       { type: "integer" },
        },
        required: ["cliente_whatsapp_id", "condominio_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "abrir_chamado",
      description: "Abre um chamado de suporte para o condomínio. Sempre classifique categoria e prioridade.",
      parameters: {
        type: "object",
        properties: {
          conversa_id:  { type: "integer", description: "ID da conversa WhatsApp" },
          condominio_id: { type: "integer", description: "ID do condomínio" },
          titulo:       { type: "string",  description: "Título curto do problema" },
          descricao:    { type: "string",  description: "Descrição detalhada" },
          prioridade:   {
            type: "string",
            enum: ["p1", "p2", "p3", "p4"],
            description: "Criticidade: p1=sem água/risco imediato/emergência, p2=funciona parcialmente com risco de agravar, p3=funciona normalmente mas precisa atenção, p4=preventiva/agendamento/sem urgência",
          },
          categoria:    {
            type: "string",
            enum: ["vazamento", "bomba_falha", "nivel_baixo", "sem_agua", "ruido", "manutencao", "outro"],
            description: "Tipo de problema. vazamento=água escapando; bomba_falha=bomba não funciona/com defeito; nivel_baixo=reservatório com pouca água; sem_agua=sem abastecimento; ruido=barulho anormal; manutencao=solicitação preventiva; outro=não se encaixa nas demais",
          },
        },
        required: ["conversa_id", "titulo", "descricao", "prioridade", "categoria"],
      },
    },
  },
];

// ─── Executa a função solicitada pela IA ──────────────────────────────────────

async function executarFuncao(nome, args) {
  switch (nome) {
    case "buscar_telemetria":          return buscarTelemetria(args);
    case "buscar_chamados_abertos":    return buscarChamadosAbertos(args);
    case "abrir_chamado":              return abrirChamado(args);
    case "buscar_condominio":          return buscarCondominio(args);
    case "vincular_cliente_condominio": return vincularClienteCondominio(args);
    default:
      throw new Error(`Função desconhecida: ${nome}`);
  }
}

// ─── Orquestrador principal ───────────────────────────────────────────────────

// Prompt padrão usado quando a config 'ia.system_prompt' está vazia.
// Editável pelo master admin em Configurações → IA.
const SYSTEM_PROMPT_PADRAO = `Você é um assistente de atendimento da General Bombas, empresa especializada em
sistemas de abastecimento de água para condomínios. Você atende clientes via WhatsApp.

Seu papel:
- Entender o problema do cliente em linguagem natural
- Identificar o condomínio do cliente quando ele não estiver vinculado
- Consultar dados reais do sistema quando necessário (telemetria, chamados)
- Abrir chamados de suporte quando identificar problemas
- Responder de forma clara, objetiva e humanizada

Fluxo quando o condomínio não está identificado (condominio_id ausente):
1. Pergunte o nome da pessoa e o nome ou endereço do condomínio de forma natural
2. Use buscar_condominio para procurar no sistema
3. Se encontrar: use vincular_cliente_condominio para vincular e prossiga o atendimento normalmente
4. Se não encontrar: abra o chamado com o nome e endereço informados na descrição

Fluxo quando o condomínio está identificado:
1. Se o cliente relatar problema técnico, consulte a telemetria antes de responder
2. Verifique se já existe chamado aberto para o mesmo problema
3. Se não existir, abra um chamado

Ao abrir um chamado, sempre classifique categoria e prioridade:

Categorias (escolha a mais específica):
- vazamento     — água escapando, infiltração visível, cano estourado
- bomba_falha   — bomba não liga, não desliga, ruído anormal vindo dela, queimou
- nivel_baixo   — reservatório com pouca água mas ainda funcionando
- sem_agua      — abastecimento interrompido, sem água nas torneiras
- ruido         — barulho anormal no sistema (que não é bomba)
- manutencao    — solicitação preventiva, limpeza de caixa, revisão programada
- outro         — não se encaixa nas categorias acima

Prioridades (Política P1-P4):
- p1 — Crítico: sem água, alagamento, esgoto, cheiro de queimado, risco imediato (SLA ≤3h)
- p2 — Alta: funciona parcialmente ou em modo manual, risco de agravar (SLA 24-48h)
- p3 — Controlado: funciona normalmente, precisa de inspeção ou ajuste (SLA ≤72h)
- p4 — Agendado: preventiva, retrofit, orçamento, instalação planejada (conforme agenda)

Tom e estilo:
- Você representa uma empresa profissional. Seja sempre cordial, humano e prestativo
- Na primeira mensagem de um cliente novo, se apresente brevemente como assistente da General Bombas
- Ao precisar identificar o condomínio, pergunte de forma natural — por exemplo:
  "Olá! Tudo bem? Sou o assistente da General Bombas. Para te ajudar melhor, pode me dizer seu nome e qual condomínio você está entrando em contato? Se preferir, pode me passar o endereço também."
- Colete as informações necessárias dentro da conversa — nunca como um formulário
- Respostas curtas e objetivas. Sem bullet points ou listas — escreva em texto corrido
- Não use expressões robóticas como "Claro!", "Certamente!", "Com prazer!"
- Não invente dados. Se não souber, diga que vai verificar com a equipe
- Responda sempre em português brasileiro`;

async function processarComIA({ conversa_id, condominio_id, cliente_whatsapp_id, historico }) {
  // Master admin pode desabilitar a IA globalmente em Configurações → IA
  const habilitada = await getConfigBool("ia.enabled", true);
  if (!habilitada) {
    return null; // null sinaliza ao controller que a IA não deve responder
  }

  const client = getClient();

  // Lê prompt e modelo da config dinâmica (com fallback pros padrões)
  const systemPrompt = (await getConfig("ia.system_prompt", "")) || SYSTEM_PROMPT_PADRAO;
  const modelo       = (await getConfig("ia.modelo", "gpt-4o-mini")) || "gpt-4o-mini";

  // Monta o histórico no formato da OpenAI
  const messages = [
    { role: "system", content: systemPrompt },
    ...historico.map((m) => ({
      role: m.direcao === "entrada" ? "user" : "assistant",
      content: m.conteudo || "",
    })),
  ];

  let resposta = null;

  // Loop de function calling — a IA pode chamar múltiplas funções antes de responder
  while (true) {
    const completion = await client.chat.completions.create({
      model: modelo,
      messages,
      tools,
      tool_choice: "auto",
    });

    const choice = completion.choices[0];
    messages.push(choice.message);

    if (choice.finish_reason === "tool_calls") {
      // Executa cada função solicitada pela IA
      for (const call of choice.message.tool_calls) {
        const args = JSON.parse(call.function.arguments);

        // Injeta conversa_id e condominio_id se a função precisar
        args.conversa_id         = conversa_id; // sempre usa o valor real do contexto
        args.cliente_whatsapp_id = args.cliente_whatsapp_id ?? cliente_whatsapp_id;
        if (condominio_id) args.condominio_id = args.condominio_id ?? condominio_id;

        console.log(`[ia] chamando ${call.function.name}`, args);

        let resultado;
        try {
          resultado = await executarFuncao(call.function.name, args);
        } catch (err) {
          resultado = { erro: err.message };
        }

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(resultado),
        });
      }
      continue;
    }

    // finish_reason === "stop" — IA terminou de responder
    resposta = choice.message.content;
    break;
  }

  return resposta;
}

module.exports = { processarComIA, SYSTEM_PROMPT_PADRAO };
