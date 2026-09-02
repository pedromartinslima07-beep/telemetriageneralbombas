const OpenAI = require("openai");
const { pool } = require("../db");
const { getConfig, getConfigBool } = require("./config.service");
const { registrarCriacao } = require("./chamado-historico.service");
const { calcularPiso, abaixoDoPiso } = require("./prioridade.service");

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

async function buscarStatusTecnico({ chamado_id }) {
  const r = await pool.query(
    `SELECT
       ch.id, ch.status,
       ch.tecnico_a_caminho_em, ch.tecnico_chegou_em,
       ch.tecnico_id,
       u.nome        AS tecnico_nome,
       cd.lat        AS condo_lat,
       cd.lng        AS condo_lng,
       tl.lat        AS tec_lat,
       tl.lng        AS tec_lng,
       tl.capturada_em AS tec_gps_em
     FROM chamados ch
     LEFT JOIN usuarios            u  ON u.id  = ch.tecnico_id
     LEFT JOIN condominios         cd ON cd.id = ch.condominio_id
     LEFT JOIN tecnico_localizacoes tl ON tl.tecnico_id = ch.tecnico_id
     WHERE ch.id = $1`,
    [chamado_id]
  );
  if (!r.rows.length) return { erro: "Chamado não encontrado" };
  const row = r.rows[0];

  if (!row.tecnico_id) return { status: "sem_tecnico_designado" };
  if (!row.tecnico_a_caminho_em) return { tecnico_nome: row.tecnico_nome, status: "tecnico_designado_mas_nao_saiu" };
  if (row.tecnico_chegou_em)     return { tecnico_nome: row.tecnico_nome, status: "tecnico_ja_chegou", chegou_em: row.tecnico_chegou_em };

  const resultado = {
    tecnico_nome: row.tecnico_nome,
    status: "a_caminho",
    a_caminho_desde: row.tecnico_a_caminho_em,
  };

  // Estima ETA se tiver GPS do técnico e coordenadas do condomínio
  if (row.tec_lat && row.tec_lng && row.condo_lat && row.condo_lng) {
    const toRad = (d) => d * Math.PI / 180;
    const R = 6371;
    const dLat = toRad(row.condo_lat - row.tec_lat);
    const dLng = toRad(row.condo_lng - row.tec_lng);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(toRad(row.tec_lat)) * Math.cos(toRad(row.condo_lat)) * Math.sin(dLng / 2) ** 2;
    const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const etaMin = Math.round((distKm / 40) * 60); // 40 km/h velocidade urbana média
    const gpsIdadeMin = Math.round((Date.now() - new Date(row.tec_gps_em).getTime()) / 60000);

    resultado.distancia_km     = Math.round(distKm * 10) / 10;
    resultado.eta_minutos      = etaMin;
    resultado.gps_idade_minutos = gpsIdadeMin;
    if (gpsIdadeMin > 10) {
      resultado.aviso = `GPS do técnico foi atualizado há ${gpsIdadeMin} min — a estimativa pode ser imprecisa`;
    }
  } else {
    resultado.sem_gps = "Posição do técnico não disponível — estimativa de tempo indisponível";
  }

  return resultado;
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
  // ⚠️ A IA NÃO PODE CLASSIFICAR ABAIXO DO PISO (02/09/2026). O prompt descreve
  // a cláusula 7, mas prompt é pedido, não garantia: um modelo que leia "tem
  // água na garagem mas o zelador fechou o registro" e responda p3 rebaixaria
  // sozinho um chamado que o contrato põe em P1 — e P1 é o que aciona o
  // plantão 24h (cláusula 8.1). A rebaixa exige justificativa humana
  // (cláusula 7.1.c), e a IA não tem como assinar isso; então aqui ela só
  // pode SUBIR. Quem discordar reclassifica depois, pelo PATCH, com motivo.
  const pisoIA = calcularPiso({ categoria: categoria || "outro" });
  if (abaixoDoPiso(prioridade, pisoIA.prioridade)) {
    console.log(
      `[ia] prioridade ${prioridade} elevada ao piso ${pisoIA.prioridade} ` +
      `(categoria "${categoria}") na conversa ${conversa_id}`
    );
    prioridade = pisoIA.prioridade;
  }

  // Guard anti-duplicata: se já existe chamado aberto nesta conversa, retorna o existente.
  const dup = await pool.query(
    `SELECT id, titulo, status FROM chamados
      WHERE conversa_id = $1 AND status != 'fechado'
      ORDER BY criado_em DESC LIMIT 1`,
    [conversa_id]
  );
  if (dup.rows.length) {
    const c = dup.rows[0];
    return {
      chamado_ja_existe: true,
      chamado_id: c.id,
      titulo: c.titulo,
      status: c.status,
      aviso: "Já existe um chamado aberto para esta conversa. Não foi criado um novo.",
    };
  }

  // Backend como juiz final (Prioridade 3):
  // P1 é emergência — abre imediatamente sem pedir confirmação.
  // Qualquer outra prioridade: armazena como pendente_acao e aguarda confirmação do cliente.
  // O controller detecta a confirmação na próxima mensagem e executa.
  if (prioridade !== "p1") {
    await pool.query(
      `UPDATE conversas_whatsapp
          SET pendente_acao   = $1,
              estado_conversa = 'aguardando_confirmacao'
        WHERE id = $2`,
      [
        // `prioridade_piso` viaja junto: o chamado só é inserido quando o
        // cliente confirmar, e lá o controller precisa gravar o piso que
        // valeu AGORA, não recalcular com a regra de então.
        JSON.stringify({
          tipo: "abrir_chamado",
          params: { condominio_id, titulo, descricao, prioridade, categoria, prioridade_piso: pisoIA.prioridade },
        }),
        conversa_id,
      ]
    );
    return {
      aguardando_confirmacao: true,
      resumo: `Chamado ${prioridade.toUpperCase()} — "${titulo}". Backend aguarda confirmação do cliente antes de abrir.`,
    };
  }

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
    `INSERT INTO chamados (conversa_id, condominio_id, titulo, descricao, prioridade, categoria,
                           prioridade_piso)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [conversa_id, condominio_id || null, titulo, descricaoFinal, prioridade, categoria || 'outro',
     pisoIA.prioridade]
  );
  registrarCriacao({ chamadoId: result.rows[0].id, alteradoPor: null });
  await pool.query(
    `UPDATE conversas_whatsapp SET estado_conversa = 'chamado_aberto', pendente_acao = NULL WHERE id = $1`,
    [conversa_id]
  );
  return { chamado_id: result.rows[0].id };
}

// Executa de fato a criação do orçamento — chamada tanto pela IA (após confirmação)
// quanto pelo controller quando o cliente confirma a ação pendente.
async function _executarCriarOrcamento({ condominio_id, resumo_pedido, observacoes }) {
  const partes = [
    "Pedido recebido pelo WhatsApp (registrado pela IA).",
    `\nResumo do que o cliente solicitou:\n${resumo_pedido}`,
  ];
  if (observacoes) partes.push(`\nObservações adicionais:\n${observacoes}`);
  const constatacao = partes.join("\n");

  const numQ = await pool.query(
    "SELECT 'OR-' || LPAD(nextval('orcamento_numero_seq')::text, 6, '0') AS n"
  );
  const numero = numQ.rows[0].n;

  const r = await pool.query(
    `INSERT INTO orcamentos (numero, condominio_id, status, origem, constatacao, criado_por)
     VALUES ($1, $2, 'rascunho', 'ia', $3, NULL)
     RETURNING id, numero`,
    [numero, condominio_id || null, constatacao]
  );

  return { orcamento_id: r.rows[0].id, numero: r.rows[0].numero };
}

async function criarSolicitacaoOrcamento({ conversa_id, condominio_id, resumo_pedido, observacoes }) {
  // Backend como juiz final: armazena como pendente e aguarda confirmação do cliente.
  await pool.query(
    `UPDATE conversas_whatsapp
        SET pendente_acao   = $1,
            estado_conversa = 'aguardando_confirmacao'
      WHERE id = $2`,
    [
      JSON.stringify({ tipo: "criar_solicitacao_orcamento", params: { condominio_id, resumo_pedido, observacoes } }),
      conversa_id,
    ]
  );
  return {
    aguardando_confirmacao: true,
    resumo: `Solicitação de orçamento — "${resumo_pedido}". Backend aguarda confirmação do cliente antes de registrar.`,
  };
}

async function escalarParaAtendente({ conversa_id }) {
  await pool.query(
    `UPDATE conversas_whatsapp
        SET aguardando_atendente = TRUE,
            estado_conversa      = 'escalado',
            pendente_acao        = NULL
      WHERE id = $1`,
    [conversa_id]
  );
  return { ok: true };
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
            description: "Criticidade pela cláusula 7 do contrato, medida por IMPACTO e não por tipo de problema. " +
              "p1 = risco imediato de desabastecimento, inundação de área crítica ou falha de sistema essencial (3h); " +
              "p2 = falha relevante mas com condição provisória, redundância parcial ou sem risco imediato (48h); " +
              "p3 = anomalia sem risco imediato, reserva indisponível sem perda da função principal (72h); " +
              "p4 = melhoria, levantamento, adequação ou o que depende de planejamento/orçamento (agendamento). " +
              "Na dúvida entre duas faixas, escolha a mais grave.",
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
  {
    type: "function",
    function: {
      name: "criar_solicitacao_orcamento",
      description:
        "Registra um pedido de orçamento na fila comercial. Use quando o cliente solicita valor/cotação, " +
        "pede pra trocar/instalar/reformar algo planejado, ou pergunta 'quanto custa'. " +
        "NUNCA use para problema operacional (algo quebrado, vazando, sem água) — nesse caso use abrir_chamado. " +
        "Você não cota preço — apenas encaminha o pedido pra equipe comercial preencher e enviar.",
      parameters: {
        type: "object",
        properties: {
          condominio_id: { type: "integer", description: "ID do condomínio (se já vinculado)" },
          resumo_pedido: {
            type: "string",
            description:
              "Resumo objetivo do que o cliente quer orçar (equipamento, serviço, escopo aproximado). " +
              "Ex.: 'Troca da bomba de recalque do prédio. Cliente menciona que a atual está fazendo ruído há 2 meses e quer modelo similar ou superior.'",
          },
          observacoes: {
            type: "string",
            description: "Informações adicionais úteis pra cotação: prazo desejado, restrições, fotos mencionadas etc. Opcional.",
          },
        },
        required: ["resumo_pedido"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_status_tecnico",
      description:
        "Consulta o status do técnico designado a um chamado: se está a caminho, já chegou, ou ainda não saiu. " +
        "Quando disponível, calcula a distância até o condomínio e estima o tempo de chegada com base no GPS do técnico. " +
        "Use quando o cliente perguntar sobre horário de chegada, previsão ou 'cadê o técnico'.",
      parameters: {
        type: "object",
        properties: {
          chamado_id: { type: "integer", description: "ID do chamado para consultar o técnico designado" },
        },
        required: ["chamado_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "escalar_para_atendente",
      description:
        "Encerra o atendimento automático e coloca a conversa na fila para um atendente humano. " +
        "Use quando: (1) você já disse que vai redirecionar; (2) a conversa está longa sem resolução; " +
        "(3) o cliente fez 3+ perguntas que você não consegue responder com certeza. " +
        "SEMPRE chame esta função junto com a mensagem de redirecionamento — nunca só prometa redirecionar sem chamar.",
      parameters: {
        type: "object",
        properties: {
          conversa_id: { type: "integer", description: "ID da conversa WhatsApp" },
        },
        required: ["conversa_id"],
      },
    },
  },
];

// ─── Executa a função solicitada pela IA ──────────────────────────────────────

async function executarFuncao(nome, args) {
  switch (nome) {
    case "buscar_telemetria":           return buscarTelemetria(args);
    case "buscar_chamados_abertos":     return buscarChamadosAbertos(args);
    case "buscar_status_tecnico":       return buscarStatusTecnico(args);
    case "abrir_chamado":               return abrirChamado(args);
    case "criar_solicitacao_orcamento": return criarSolicitacaoOrcamento(args);
    case "buscar_condominio":           return buscarCondominio(args);
    case "vincular_cliente_condominio": return vincularClienteCondominio(args);
    case "escalar_para_atendente":      return escalarParaAtendente(args);
    default:
      throw new Error(`Função desconhecida: ${nome}`);
  }
}

// ─── Orquestrador principal ───────────────────────────────────────────────────

// Prompt padrão usado quando a config 'ia.system_prompt' está vazia.
// Editável pelo master admin em Configurações → IA.
const SYSTEM_PROMPT_PADRAO = `Você é um assistente de atendimento da General Bombas, empresa especializada em
sistemas de abastecimento de água para condomínios. Você atende a gestão do prédio via WhatsApp.

Quem fala com você:
- Na grande maioria dos casos, os clientes da General Bombas são CONDOMÍNIOS, e o interlocutor é alguém da gestão: síndico, subsíndico, zelador, porteiro, administrador ou gerente predial
- Em casos minoritários (porém possíveis), o cliente é uma pessoa física: morador de casa, sítio, comércio próprio ou até morador de condomínio contratando algo por conta própria (instalação numa área privada, por exemplo)
- POR ISSO, no primeiro contato, descubra com naturalidade o contexto da pessoa antes de assumir. Boa abordagem: "Você está falando em nome de um condomínio ou é um atendimento particular?"
- Se for gestão de condomínio: trate como responsável técnico/administrativo — ela tem acesso à casa de bombas, conhece o sistema e fala em nome do prédio. NUNCA diga "avise o síndico", "fale com o zelador" ou "consulte a administração", quem está conversando com você JÁ é essa pessoa.
- Se for pessoa física (casa/comércio/particular): trate como cliente final mesmo, e ajuste a linguagem (menos jargão técnico de prédio, mais explicação)
- Se for morador comum perguntando sobre o prédio onde mora: oriente educadamente a procurar a administração/zelador, porque a relação contratual da General Bombas é com o condomínio

Seu papel:
- Entender a demanda da gestão em linguagem natural
- Identificar o condomínio quando ele não estiver vinculado
- Consultar dados reais do sistema quando necessário (telemetria, chamados)
- Encaminhar a demanda para o lugar certo: chamado (problema operacional) ou orçamento (solicitação comercial)
- Responder de forma clara, objetiva e humanizada

Chamado x Orçamento — escolha o caminho certo:
- CRIAR SOLICITAÇÃO DE ORÇAMENTO quando o cliente pede valor, cotação, "quanto custa", quer trocar/instalar/reformar algo planejado, pedir proposta para serviço novo. Use criar_solicitacao_orcamento.
- Você NÃO cota preço nem promete prazos comerciais. No orçamento, apenas registra o pedido para a equipe comercial preencher e responder.

Abertura de chamado — só com confirmação do cliente (regra importante):
- NUNCA abra um chamado por iniciativa própria. Sempre pergunte antes: "Posso abrir um chamado para registrar isso e acionar a equipe?" — e só execute após o cliente confirmar com "sim", "pode", "por favor" ou equivalente
- EXCEÇÃO: se o problema for P1 (sem água em todo o prédio, alagamento, cheiro de queimado, risco imediato), abra o chamado sem pedir confirmação e avise o cliente que já foi registrado como emergência — a urgência justifica agir sem esperar
- Se o cliente já pedir explicitamente ("abre um chamado", "registra aí", "preciso de um técnico"), abra diretamente sem perguntar de novo

Fluxo quando o condomínio não está identificado (condominio_id ausente):
1. Pergunte o nome da pessoa e o nome ou endereço do condomínio de forma natural
2. Use buscar_condominio para procurar no sistema
3. Se encontrar: use vincular_cliente_condominio para vincular e prossiga o atendimento normalmente
4. Se não encontrar: registre a demanda (chamado ou orçamento) com o nome e endereço informados na descrição

Fluxo quando o condomínio está identificado:
1. Se o cliente relatar problema técnico, consulte a telemetria antes de responder
2. Verifique se já existe chamado aberto para o mesmo problema
3. Se não existir, abra um chamado OU registre uma solicitação de orçamento conforme o caso

Ao abrir um chamado, sempre classifique categoria, prioridade e crie um título profissional:

Título do chamado — regras:
- Máximo 60 caracteres
- Formato: "[Problema] – [detalhe se relevante]". Exemplos: "Falta de água total", "Bomba de recalque com falha", "Nível crítico no reservatório superior", "Vazamento na casa de bombas"
- Nunca use "condomínio" no título (já está vinculado)
- Nunca use caixa baixa completa nem exclamações
- Seja específico: "Bomba não liga" é melhor que "Problema com bomba"

Ao abrir um chamado, sempre classifique categoria e prioridade:

Categorias (escolha a mais específica):
- vazamento     — água escapando, infiltração visível, cano estourado
- bomba_falha   — bomba não liga, não desliga, ruído anormal vindo dela, queimou
- nivel_baixo   — reservatório com pouca água mas ainda funcionando
- sem_agua      — abastecimento interrompido, sem água nas torneiras
- ruido         — barulho anormal no sistema (que não é bomba)
- manutencao    — solicitação preventiva, limpeza de caixa, revisão programada
- outro         — não se encaixa nas categorias acima

Prioridades — CLÁUSULA 7 DO CONTRATO. O que classifica é o IMPACTO, não o tipo
de problema: o mesmo "vazamento" é P1 alagando a casa de bombas e P3 gotejando
com a bomba reserva rodando. Antes de escolher, pergunte-se duas coisas:
(1) há risco IMEDIATO? (2) há redundância — a reserva assumiu, existe condição
provisória?

- p1 — Crítico (3h): risco imediato de desabastecimento relevante; poço ou área
  crítica com risco de inundação; falha crítica de sistema essencial.
  Exemplos: sem água no prédio, alagamento em curso, cheiro de queimado.
- p2 — Alto (48h): falha relevante, MAS com condição provisória, redundância
  parcial ou sem risco imediato. A bomba reserva assumiu, o prédio tem água,
  e ainda assim há falha que precisa de intervenção.
- p3 — Programável (72h): anomalia sem risco imediato; equipamento reserva
  indisponível SEM perda da função principal; corretiva não crítica.
- p4 — Baixa criticidade (agendamento): melhorias, levantamentos, adequações,
  solicitações estéticas, ou o que depende de planejamento/orçamento.

⚠️ Na dúvida entre duas faixas, escolha a MAIS grave. Quem classifica para
baixo por engano tira do cliente um prazo que o contrato garante; para cima,
apenas antecipa a visita. E o backend só aceita subir: se você classificar
abaixo do piso da categoria, ele eleva de volta sozinho.

Quando encerrar o atendimento e redirecionar para um humano:
- ESCALADA IMEDIATA (sem esperar 3 perguntas) nas seguintes situações:
  * O cliente pergunta que horas o técnico chega, previsão de chegada, tempo de espera, ETA — PRIMEIRO chame buscar_status_tecnico com o id do chamado aberto. Se o técnico estiver a caminho e o GPS estiver disponível, informe a estimativa ("O técnico está a aproximadamente X min de distância"). Se não houver GPS ou técnico designado, aí sim escale para atendente.
  * O cliente demonstra frustração, impaciência ou insatisfação com a demora ("cadê o técnico", "já faz horas", "isso é um absurdo") — chame buscar_status_tecnico primeiro para ter uma resposta concreta; se não houver informação, escale.
  * A pergunta envolve compromisso comercial, contrato, negociação de valor ou condições que só a equipe pode confirmar.
- Se o cliente fizer 3 ou mais perguntas consecutivas que você não consegue responder com certeza (valores, prazos técnicos específicos, detalhes de contrato, situações que fogem do roteiro), redirecione: "Essa pergunta é melhor respondida diretamente pela nossa equipe. Vou deixar um atendente dar sequência, tudo bem?"
- Se a conversa estiver longa e o cliente ainda não chegou a um desfecho claro (nem chamado, nem orçamento, nem dúvida resolvida), ofereça: "Para garantir que você seja atendido da melhor forma, posso encaminhar para um de nossos atendentes. Prefere isso?"
- SEMPRE que disser que vai redirecionar, chame imediatamente a função escalar_para_atendente — nunca só prometa sem executar. A função garante que a IA não responda mais nessa conversa
- Após chamar escalar_para_atendente, envie uma última mensagem de encerramento e pare. Não responda mais nada mesmo que o cliente escreva de novo — um atendente humano vai assumir

Lead de telemetria — quando o cliente pergunta sobre contratar o serviço:
- Reconheça frases como "quero saber mais sobre telemetria", "quanto custa o monitoramento", "como funciona o sistema de vocês", "tenho interesse no serviço" como leads comerciais, não problemas operacionais
- NÃO abra chamado nesses casos. O fluxo correto é: conversar naturalmente, coletar as informações do imóvel e registrar uma solicitação de orçamento
- Explique o serviço de forma breve e natural: a General Bombas instala sensores nos reservatórios do condomínio que monitoram o nível da água e o status das bombas em tempo real. A gestão acompanha tudo pelo painel online e recebe alertas automáticos quando algo sai do normal
- Colete as informações necessárias em ordem natural dentro da conversa, sem parecer um formulário:
  1. Nome da pessoa e do condomínio (ou endereço, se não souber o nome)
  2. Quantos reservatórios o prédio tem (caixas d'água, cisternas, reservatórios de incêndio)
  3. Se já tem sistema de bombeamento (recalque, pressurização) — ajuda a dimensionar
  4. Qualquer necessidade específica que o cliente mencionou
- Quando tiver o suficiente para a equipe comercial dar continuidade (pelo menos nome/condomínio e número de reservatórios), use criar_solicitacao_orcamento com um resumo completo incluindo tudo que coletou
- Após registrar, informe que a equipe comercial vai entrar em contato em breve para apresentar uma proposta personalizada. Não prometa prazo específico nem valor

Tom e estilo:
- Você representa uma empresa profissional. Seja sempre cordial, humano e prestativo
- Na primeira mensagem de um cliente novo, se apresente brevemente como assistente da General Bombas
- Quando o condomínio já está identificado no contexto (campo "Condomínio" preenchido), NÃO pergunte qual é o condomínio — já sabe. Vá direto ao ponto
- Ao precisar identificar o condomínio (quando não estiver no contexto), pergunte de forma natural — por exemplo:
  "Olá! Sou o assistente da General Bombas. Para te ajudar, pode me dizer o nome do condomínio?"
- Colete as informações necessárias dentro da conversa — nunca como um formulário
- Respostas curtas e objetivas. Sem bullet points ou listas — escreva em texto corrido
- Não use expressões robóticas como "Claro!", "Certamente!", "Com prazer!", "Sinto muito por isso!", "Lamento saber disso!"
- Empatia sim, mas de forma direta — em vez de "Sinto muito!", diga "Entendido, vou resolver isso." ou similar
- Não invente dados. Se não souber, diga que vai verificar com a equipe
- Responda sempre em português brasileiro`;

// Busca telemetria, alertas e chamados abertos do condomínio para injetar
// como contexto antes de chamar a OpenAI. Nunca bloqueia — erros são silenciosos.
async function _buscarContextoOperacional(condominio_id) {
  if (!condominio_id) return null;
  try {
    const [telRes, alertRes, chamRes] = await Promise.all([
      pool.query(
        `SELECT r.nome, l.nivel_pct, l.bomba_ligada
           FROM reservatorios r
           LEFT JOIN LATERAL (
             SELECT nivel_pct, bomba_ligada
               FROM leituras WHERE device_id = r.device_id
              ORDER BY criado_em DESC LIMIT 1
           ) l ON true
          WHERE r.condominio_id = $1`,
        [condominio_id]
      ),
      pool.query(
        `SELECT tipo, mensagem FROM alertas
          WHERE condominio_id = $1 AND status = 'aberto'
          ORDER BY criado_em DESC LIMIT 5`,
        [condominio_id]
      ),
      pool.query(
        `SELECT titulo, prioridade, status FROM chamados
          WHERE condominio_id = $1 AND status != 'fechado'
          ORDER BY criado_em DESC LIMIT 3`,
        [condominio_id]
      ),
    ]);

    const linhas = [];
    if (telRes.rows.length) {
      linhas.push("TELEMETRIA ATUAL:");
      telRes.rows.forEach(r => {
        const nivel = r.nivel_pct != null ? `${r.nivel_pct}%` : "sem leitura";
        const bomba = r.bomba_ligada ? "LIGADA" : "DESLIGADA";
        linhas.push(`  • ${r.nome}: nível ${nivel}, bomba ${bomba}`);
      });
    }
    if (alertRes.rows.length) {
      linhas.push("ALERTAS ABERTOS:");
      alertRes.rows.forEach(a => linhas.push(`  • ${a.tipo}: ${a.mensagem}`));
    }
    if (chamRes.rows.length) {
      linhas.push("CHAMADOS EM ABERTO:");
      chamRes.rows.forEach(c =>
        linhas.push(`  • [${c.prioridade.toUpperCase()}] ${c.titulo} (${c.status})`)
      );
    }
    return linhas.length ? linhas.join("\n") : null;
  } catch (_) {
    return null;
  }
}

// Ferramentas que indicam progresso real na conversa (reset do anti-loop)
const FERRAMENTAS_PROGRESSO = new Set([
  "abrir_chamado",
  "criar_solicitacao_orcamento",
  "vincular_cliente_condominio",
  "escalar_para_atendente",
]);

async function processarComIA({
  conversa_id,
  condominio_id,
  condominio_nome,
  cliente_whatsapp_id,
  contato_nome,
  contato_tipo,
  contato_observacoes,
  historico,
}) {
  // Master admin pode desabilitar a IA globalmente em Configurações → IA
  const habilitada = await getConfigBool("ia.enabled", true);
  if (!habilitada) {
    return null; // null sinaliza ao controller que a IA não deve responder
  }

  const client = getClient();

  // Lê prompt e modelo da config dinâmica (com fallback pros padrões)
  const systemPrompt = (await getConfig("ia.system_prompt", "")) || SYSTEM_PROMPT_PADRAO;
  const modelo       = (await getConfig("ia.modelo", "gpt-4o-mini")) || "gpt-4o-mini";

  // Bloco de contexto do contato — só anexa quando há informação útil pré-cadastrada.
  // Quando vazio, a IA segue o fluxo original e pergunta nome/condomínio normalmente.
  const ctxLinhas = [];
  if (contato_nome)        ctxLinhas.push(`- Nome do contato: ${contato_nome}`);
  if (contato_tipo === "gestao_condominio") {
    ctxLinhas.push(`- Tipo: gestão de condomínio (não precisa perguntar contexto)`);
    if (condominio_nome) ctxLinhas.push(`- Condomínio: ${condominio_nome} (id ${condominio_id})`);
  } else if (contato_tipo === "pessoa_fisica") {
    ctxLinhas.push(`- Tipo: pessoa física / atendimento particular (não precisa perguntar contexto)`);
  }
  if (contato_observacoes) ctxLinhas.push(`- Observações do cadastro: ${contato_observacoes}`);

  // Contexto operacional pré-injetado (Prioridade 2 — evita tool calls desnecessários)
  const ctxOperacional = await _buscarContextoOperacional(condominio_id);
  const blocoOperacional = ctxOperacional
    ? `\n\nSITUAÇÃO ATUAL DO CONDOMÍNIO (dados em tempo real — use para contextualizar sem precisar chamar buscar_telemetria):\n${ctxOperacional}`
    : "";

  const blocoContexto = ctxLinhas.length
    ? `\n\nCONTEXTO PRÉ-CADASTRADO DO CONTATO (use sem perguntar de novo, cumprimente pelo nome quando fizer sentido):\n${ctxLinhas.join("\n")}`
    : "";

  // Monta o histórico no formato da OpenAI
  const messages = [
    { role: "system", content: systemPrompt + blocoContexto + blocoOperacional },
    ...historico.map((m) => ({
      role: m.direcao === "entrada" ? "user" : "assistant",
      content: m.conteudo || "",
    })),
  ];

  let resposta = null;
  const ferramentasUsadas = new Set();

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
      for (const call of choice.message.tool_calls) {
        const args = JSON.parse(call.function.arguments);

        args.conversa_id         = conversa_id;
        args.cliente_whatsapp_id = args.cliente_whatsapp_id ?? cliente_whatsapp_id;
        if (condominio_id) args.condominio_id = args.condominio_id ?? condominio_id;

        console.log(`[ia] chamando ${call.function.name}`, args);
        ferramentasUsadas.add(call.function.name);

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

    resposta = choice.message.content;
    break;
  }

  const progresso = [...ferramentasUsadas].some(f => FERRAMENTAS_PROGRESSO.has(f));
  return { resposta, progresso };
}

module.exports = { processarComIA, SYSTEM_PROMPT_PADRAO, _executarCriarOrcamento };
