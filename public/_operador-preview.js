// _operador-preview.js — a rede de mentira da prévia sem login.
//
// ⚠️ ARQUIVO DE PRÉVIA, GERADO, TEMPORÁRIO. Alcançável só por
// /dev/_operador-preview.html, rota que NÃO existe em produção.
// Ele não duplica CSS nem JS: a página carrega o /static/operador.css e o
// /static/operador.js de verdade, e aqui só se troca o fetch.
//
// Carrega SEM defer, antes do operador.js (que é defer): o operador.js lê o
// token na primeira linha e mandaria para /login sem isto.
(function () {
  // localStorage pode ESTOURAR (aba anônima, visualizador com storage
  // bloqueado). O operador.js lê o token na PRIMEIRA linha, então um throw
  // ali mata a tela inteira: shim em memória quando o de verdade não vai.
  try { localStorage.setItem("__t", "1"); localStorage.removeItem("__t"); }
  catch (e) {
    var mem = {};
    Object.defineProperty(window, "localStorage", { configurable: true, value: {
      getItem: function (k) { return k in mem ? mem[k] : null; },
      setItem: function (k, v) { mem[k] = String(v); },
      removeItem: function (k) { delete mem[k]; },
      clear: function () { mem = {}; },
    } });
  }
  // ⚠️ A PRÉVIA EMPRESTA O localStorage, NÃO O TOMA (corrigido em 31/08).
  //
  // O sintoma que o Pedro viu: "sempre que eu clico em Aprovados a tela cai".
  // A conta é esta — a prévia escrevia `token = "preview"` e ia embora. Como
  // ela mora no MESMO ORIGIN do painel de verdade, aquele valor ficava valendo
  // para todas as telas: a próxima request real levava `Bearer preview`,
  // tomava 401, e o interceptador de sessão (que existe para deslogar quem
  // expirou) limpava o storage e mandava para `/login?motivo=expirado`.
  //
  // Ou seja: **abrir a prévia deslogava do sistema**, e o efeito só aparecia
  // no clique seguinte, longe da causa. Eu mesmo caí nisso três vezes nesta
  // sessão e culpei o `inatividade.js`.
  //
  // Agora as três chaves são guardadas e DEVOLVIDAS ao sair da página. O
  // `pagehide` é o evento certo: `beforeunload` não dispara em navegação por
  // link no iOS, e `unload` já não é garantido em navegador nenhum.
  var CHAVES = ["token", "user", "userRole"];
  var ANTES = {};
  CHAVES.forEach(function (k) { ANTES[k] = localStorage.getItem(k); });
  window.addEventListener("pagehide", function () {
    CHAVES.forEach(function (k) {
      if (ANTES[k] === null) localStorage.removeItem(k);
      else localStorage.setItem(k, ANTES[k]);
    });
  });

  localStorage.setItem("token", "preview");
  localStorage.setItem("user", JSON.stringify({ id: 1, nome: "Ana Paula Souza", role: "operador" }));
  localStorage.setItem("userRole", "operador");

  var FIX = {
  "agora": "2026-08-28T00:08:22.888Z",
  "limiares": {
    "baixo": 45,
    "critico": 20
  },
  "fila": [
    {
      "id": 4821,
      "titulo": "Nível crítico no reservatório superior",
      "descricao": "Alerta automático: coluna d'água abaixo de 20% às 05h48.",
      "categoria": "nivel_baixo",
      "prioridade": "p1",
      "status": "aberto",
      "criado_em": "2026-08-27T20:34:22.888Z",
      "minutos_abertos": 214,
      "origem": "telemetria",
      "sla": {
        "relogio": "primeira resposta",
        "resta_min": -37,
        "estourado": true
      },
      "condominio": {
        "id": 12,
        "nome": "Edifício Aurora Paulista",
        "bairro": "Bela Vista",
        "cidade": "São Paulo",
        "lat": -23.5605,
        "lng": -46.6433
      },
      "tecnico": null,
      "a_caminho_em": null,
      "chegou_em": null,
      "reservatorios": [
        {
          "id": 1,
          "nome": "Caixa Superior",
          "nivel_pct": 13,
          "mudo": false,
          "banda": "critico"
        },
        {
          "id": 2,
          "nome": "Cisterna",
          "nivel_pct": 38,
          "mudo": false,
          "banda": "baixo"
        }
      ],
      "tem_telemetria": true
    },
    {
      "id": 4820,
      "titulo": "Bomba de recalque desarmando sozinha",
      "descricao": "Zelador relata que a bomba desarma toda madrugada e ele precisa religar no quadro.",
      "categoria": "bomba",
      "prioridade": "p2",
      "status": "aberto",
      "criado_em": "2026-08-27T22:32:22.888Z",
      "minutos_abertos": 96,
      "origem": "whatsapp",
      "sla": {
        "relogio": "chegada",
        "resta_min": 24,
        "estourado": false
      },
      "condominio": {
        "id": 7,
        "nome": "Residencial Vila Mariana",
        "bairro": "Vila Mariana",
        "cidade": "São Paulo",
        "lat": -23.5893,
        "lng": -46.635
      },
      "tecnico": null,
      "a_caminho_em": null,
      "chegou_em": null,
      "reservatorios": [
        {
          "id": 3,
          "nome": "Caixa Superior",
          "nivel_pct": 62,
          "mudo": false,
          "banda": "ok"
        }
      ],
      "tem_telemetria": true
    },
    {
      "id": 4815,
      "titulo": "Reservatório sem leitura há 3 horas",
      "descricao": "Dispositivo offline: nenhuma leitura recebida desde as 02h10.",
      "categoria": "nivel_baixo",
      "prioridade": "p3",
      "status": "aberto",
      "criado_em": "2026-08-27T21:08:22.888Z",
      "minutos_abertos": 180,
      "origem": "telemetria",
      "sla": {
        "relogio": "resolução",
        "resta_min": 300,
        "estourado": false
      },
      "condominio": {
        "id": 9,
        "nome": "Edifício Mont Blanc",
        "bairro": "Moema",
        "cidade": "São Paulo",
        "lat": -23.599,
        "lng": -46.665
      },
      "tecnico": null,
      "a_caminho_em": null,
      "chegou_em": null,
      "reservatorios": [
        {
          "id": 5,
          "nome": "Caixa Superior Bloco A",
          "nivel_pct": null,
          "mudo": true,
          "banda": "mudo"
        }
      ],
      "tem_telemetria": true
    },
    {
      "id": 4802,
      "titulo": "Revisão preventiva trimestral do conjunto",
      "descricao": "Plano de manutenção preventiva.",
      "categoria": "preventiva",
      "prioridade": "p4",
      "status": "aberto",
      "criado_em": "2026-08-27T00:48:22.888Z",
      "minutos_abertos": 1400,
      "origem": "preventiva",
      "sla": null,
      "condominio": {
        "id": 30,
        "nome": "Residencial Alto da Lapa",
        "bairro": "Lapa",
        "cidade": "São Paulo",
        "lat": -23.53,
        "lng": -46.705
      },
      "tecnico": null,
      "a_caminho_em": null,
      "chegou_em": null,
      "reservatorios": [],
      "tem_telemetria": false
    },
    {
      "id": 4818,
      "titulo": "Vazamento no barrilete do subsolo",
      "descricao": "Chamado aberto pelo síndico por telefone.",
      "categoria": "hidraulica",
      "prioridade": "p2",
      "status": "em_atendimento",
      "criado_em": "2026-08-27T23:10:22.888Z",
      "minutos_abertos": 58,
      "origem": "manual",
      "sla": {
        "relogio": "resolução",
        "resta_min": 122,
        "estourado": false
      },
      "condominio": {
        "id": 21,
        "nome": "Condomínio Parque das Nações",
        "bairro": "Santo Amaro",
        "cidade": "São Paulo",
        "lat": -23.65,
        "lng": -46.71
      },
      "tecnico": {
        "id": 3,
        "nome": "Marcos Ribeiro"
      },
      "a_caminho_em": "2026-08-27T23:50:22.888Z",
      "chegou_em": null,
      "reservatorios": [],
      "tem_telemetria": false
    }
  ],
  "tecnicos": [
    {
      "id": 1,
      "nome": "Marcos Ribeiro",
      "disponivel": false,
      "lat": -23.648,
      "lng": -46.708,
      "gps_em": "2026-08-28T00:04:22.888Z",
      "abertos": 1
    },
    {
      "id": 2,
      "nome": "Cleber Nogueira",
      "disponivel": true,
      "lat": -23.564,
      "lng": -46.651,
      "gps_em": "2026-08-28T00:06:22.888Z",
      "abertos": 0
    },
    {
      "id": 3,
      "nome": "Wesley Antunes",
      "disponivel": true,
      "lat": -23.594,
      "lng": -46.639,
      "gps_em": "2026-08-27T23:57:22.888Z",
      "abertos": 0
    },
    {
      "id": 4,
      "nome": "Jonas Prado",
      "disponivel": false,
      "lat": null,
      "lng": null,
      "gps_em": null,
      "abertos": 2
    }
  ]
};
  var HIST = [
  {
    "id": 1,
    "criado_em": "2026-08-27T20:34:22.888Z",
    "tipo": "abertura",
    "descricao": "Chamado aberto automaticamente pela telemetria."
  },
  {
    "id": 2,
    "criado_em": "2026-08-27T22:08:22.888Z",
    "tipo": "nota",
    "descricao": "Tentativa de contato com o zelador, sem resposta."
  }
];
  // A carteira de teste: 40 prédios, 34 deles com nome fantasia diferente da
  // razão social — a proporção de produção (71 em 86).
  var CARTEIRA = [
    { id: 100, nome: "AURORA PAULISTA EMPREENDIMENTOS IMOBILIARIOS LTDA", nome_fantasia: "Aurora Paulista", bairro: "Bela Vista", cidade: "São Paulo" },
    { id: 101, nome: "CONDOMINIO EDIFICIO VILA MARIANA", nome_fantasia: "Vila Mariana", bairro: "Vila Mariana", cidade: "São Paulo" },
    { id: 102, nome: "ELVIRA FERRAZ EMPREENDIMENTOS IMOBILIARIOS LTDA", nome_fantasia: "Auri Faria Lima", bairro: "Itaim Bibi", cidade: "São Paulo" },
    { id: 103, nome: "PARQUE DAS NACOES EMPREENDIMENTOS LTDA", nome_fantasia: "Parque das Nações", bairro: "Santo Amaro", cidade: "São Paulo" },
    { id: 104, nome: "Mont Blanc", nome_fantasia: "", bairro: "Moema", cidade: "São Paulo" },
    { id: 105, nome: "SOLAR DOS IPES ADMINISTRACAO PREDIAL", nome_fantasia: "Solar dos Ipês", bairro: "Perdizes", cidade: "São Paulo" },
    { id: 106, nome: "ATHENAS INCORPORACOES S/A", nome_fantasia: "Edifício Athenas", bairro: "Pinheiros", cidade: "São Paulo" },
    { id: 107, nome: "ACAI PARTICIPACOES LTDA", nome_fantasia: "Residencial Açaí", bairro: "Butantã", cidade: "São Paulo" },
    { id: 108, nome: "Torres do Sol", nome_fantasia: "", bairro: "Tatuapé", cidade: "São Paulo" },
    { id: 109, nome: "BORGHESE EMPREENDIMENTOS", nome_fantasia: "Villa Borghese", bairro: "Jardins", cidade: "São Paulo" },
    { id: 110, nome: "RECANTO VERDE ADM DE BENS", nome_fantasia: "Recanto Verde", bairro: "Vila Mariana", cidade: "São Paulo" },
    { id: 111, nome: "PORTAL DO SOL IMOVEIS LTDA", nome_fantasia: "Portal do Sol", bairro: "Santana", cidade: "São Paulo" },
    { id: 112, nome: "EDIS CENTER COMERCIAL LTDA", nome_fantasia: "Édis Center", bairro: "República", cidade: "São Paulo" },
    { id: 113, nome: "SAO CAETANO PRIME LTDA", nome_fantasia: "São Caetano Prime", bairro: "Centro", cidade: "São Caetano do Sul" },
    { id: 114, nome: "BOURBON EMPREENDIMENTOS", nome_fantasia: "Maison Bourbon", bairro: "Higienópolis", cidade: "São Paulo" },
    { id: 115, nome: "GREEN PARK ADMINISTRADORA", nome_fantasia: "Green Park", bairro: "Morumbi", cidade: "São Paulo" },
    { id: 116, nome: "Alto da Lapa", nome_fantasia: "", bairro: "Lapa", cidade: "São Paulo" },
    { id: 117, nome: "CRISTAL TOWER PARTICIPACOES", nome_fantasia: "Cristal Tower", bairro: "Brooklin", cidade: "São Paulo" },
    { id: 118, nome: "ANALIA FRANCO EMPREENDIMENTOS", nome_fantasia: "Jardim Anália", bairro: "Análise Franco", cidade: "São Paulo" },
    { id: 119, nome: "TERRA NOVA ADM PREDIAL LTDA", nome_fantasia: "Terra Nova", bairro: "Ipiranga", cidade: "São Paulo" },
    { id: 120, nome: "VISTA ALEGRE IMOVEIS", nome_fantasia: "Vista Alegre", bairro: "Penha", cidade: "São Paulo" },
    { id: 121, nome: "ILE DE FRANCE EMPREENDIMENTOS", nome_fantasia: "Île de France", bairro: "Jardim Paulista", cidade: "São Paulo" },
    { id: 122, nome: "PORTOBELLO ADM", nome_fantasia: "Portobello", bairro: "Vila Olímpia", cidade: "São Paulo" },
    { id: 123, nome: "SERRA AZUL PARTICIPACOES LTDA", nome_fantasia: "Serra Azul", bairro: "Santo André", cidade: "Santo André" },
    { id: 124, nome: "COPACABANA SP EMPREENDIMENTOS", nome_fantasia: "Copacabana SP", bairro: "Bela Vista", cidade: "São Paulo" },
    { id: 125, nome: "NOVA ALIANCA ADM DE CONDOMINIOS", nome_fantasia: "Nova Aliança", bairro: "Saúde", cidade: "São Paulo" },
    { id: 126, nome: "BELVEDERE IMOBILIARIA LTDA", nome_fantasia: "Belvedere", bairro: "Campo Belo", cidade: "São Paulo" },
    { id: 127, nome: "RIO BRANCO EMPREENDIMENTOS", nome_fantasia: "Rio Branco", bairro: "Centro", cidade: "Diadema" },
    { id: 128, nome: "MONTE LIBANO ADM", nome_fantasia: "Monte Líbano", bairro: "Jabaquara", cidade: "São Paulo" },
    { id: 129, nome: "PRACA REAL EMPREENDIMENTOS LTDA", nome_fantasia: "Praça Real", bairro: "Vila Prudente", cidade: "São Paulo" },
    { id: 130, nome: "BOSQUE JEQUITIBAS ADM", nome_fantasia: "Bosque dos Jequitibás", bairro: "Interlagos", cidade: "São Paulo" },
    { id: 131, nome: "ILHA BELA PARTICIPACOES", nome_fantasia: "Ilha Bela", bairro: "Guarulhos", cidade: "Guarulhos" },
    { id: 132, nome: "VILLAGIO TOSCANA LTDA", nome_fantasia: "Villagio Toscana", bairro: "Mooca", cidade: "São Paulo" },
    { id: 133, nome: "AQUARELA ADM PREDIAL", nome_fantasia: "Aquarela", bairro: "Freguesia do Ó", cidade: "São Paulo" },
    { id: 134, nome: "Sol Nascente", nome_fantasia: "", bairro: "Cidade Dutra", cidade: "São Paulo" },
    { id: 135, nome: "GRAND VILLE EMPREENDIMENTOS S/A", nome_fantasia: "Grand Ville", bairro: "Barra Funda", cidade: "São Paulo" },
    { id: 136, nome: "VITORIA REGIA IMOVEIS LTDA", nome_fantasia: "Vitória Régia", bairro: "Casa Verde", cidade: "São Paulo" },
    { id: 137, nome: "MIRANTE DO VALE ADM", nome_fantasia: "Mirante do Vale", bairro: "São Bernardo", cidade: "São Bernardo do Campo" },
    { id: 138, nome: "PANORAMA EMPREENDIMENTOS LTDA", nome_fantasia: "Panorama", bairro: "Osasco", cidade: "Osasco" },
    { id: 139, nome: "CHACARA FLORA ADM DE BENS", nome_fantasia: "Chácara Flora", bairro: "Santo Amaro", cidade: "São Paulo" },
  ];

  var nativo = window.fetch ? window.fetch.bind(window) : null;

  // `status` opcional: sem ele a prévia não sabe representar um 401, e o
  // caminho de erro do formulário — o único que o front não prevê sozinho —
  // ficaria sem como ser visto.
  function J(o, status) {
    return Promise.resolve(new Response(JSON.stringify(o), {
      status: status || 200, headers: { "content-type": "application/json" },
    }));
  }

  // Reconhecimento por split/indexOf de propósito — ver o aviso no topo do
  // gerador sobre regex literal em string gerada.
  function soDigitos(s) {
    if (!s) return false;
    for (var i = 0; i < s.length; i++) {
      if (s[i] < "0" || s[i] > "9") return false;
    }
    return s.length > 0;
  }

  window.fetch = function (input, init) {
    var u = String(input && input.url ? input.url : input);
    if (u.indexOf("/operador/fila") >= 0) return J(FIX);
    // ⚠️ A AJUDA TAMBÉM PRECISA DE FIXTURE. Sem esta linha o diálogo caía no
    // `nativo`, levava o token falso "preview" para `GET /operador/prazos`,
    // tomava 401 e o interceptador de sessão mandava a prévia inteira para o
    // `/login?motivo=expirado` — abrir a ajuda derrubava a tela. Toda rota
    // NOVA que o front chamar precisa aparecer aqui; o `nativo` no fim é o
    // que faz o esquecimento virar logout em vez de erro visível.
    // Valores idênticos aos do banco de teste em 31/08 — a prévia é para
    // olhar composição, e um prazo diferente aqui ensinaria errado.
    if (u.indexOf("/operador/prazos") >= 0) {
      return J({
        prazos: [
          { prioridade: "p1", ttfr_min: 15,   sla_chegada_min: 180,  ttr_min: 240 },
          // ⚠️ 2880 (48h) e nao 1440: e o que esta em `sla_definicoes` e o que a
          // clausula 7 da minuta promete ("ate 48 horas"). A fixture dizia 24h e
          // desenhava um prazo que o contrato nao da.
          { prioridade: "p2", ttfr_min: 60,   sla_chegada_min: 2880, ttr_min: 2880 },
          { prioridade: "p3", ttfr_min: 240,  sla_chegada_min: 4320, ttr_min: 4320 },
          { prioridade: "p4", ttfr_min: 1440, sla_chegada_min: null, ttr_min: 14400 },
        ],
        limiares: { baixo: 45, critico: 20 },
        offline_min: 10,
      });
    }
    if (u.indexOf("/admin/me") >= 0) return J({ id: 1, nome: "Ana Paula Souza", role: "operador" });
    // Trocar senha: a prévia responde como o servidor responderia, incluindo o
    // caso que mais importa ver na tela — a senha atual errada, que é o único
    // erro que o front não consegue prever sozinho.
    if (u.indexOf("/auth/trocar-senha") >= 0) {
      var corpo = {};
      try { corpo = JSON.parse((init && init.body) || "{}"); } catch (e) {}
      if (corpo.senha_atual !== "certa") {
        return J({ error: "Senha atual incorreta" }, 401);
      }
      return J({ ok: true });
    }
    // ⚠️ A CARTEIRA REALISTA, e não dois prédios (02/09/2026). O campo de
    // escolher prédio virou busca porque em produção são 86 cadastros e 71
    // deles têm nome fantasia DIFERENTE da razão social — com dois itens sem
    // fantasia nenhuma dessas duas coisas se testa. Aqui vão 40, a maioria com
    // os dois nomes divergentes, para o filtro ter o que filtrar.
    if (u.indexOf("/condominios") >= 0) return J(CARTEIRA);
    // ⚠️ A RÉGUA DE PRIORIDADE (03/09/2026). O diálogo de novo chamado passou a
    // ler dela — a categoria move os botões P1–P4. Sem este dublê a prévia
    // mostra as sete categorias do HTML, a sugestão nunca acende, e o defeito
    // que o Pedro pegou ("mudo a categoria e a prioridade não muda junto")
    // continuaria invisível aqui.
    // ⚠️ VEM ANTES do recorte de "/chamados/", que casaria "/chamados/prioridades"
    // como se "prioridades" fosse um id de chamado.
    if (u.indexOf("/chamados/prioridades") >= 0) return J({
      prioridades: [
        { id: "p1", rotulo: "Crítico", plantao: true, sla_chegada_min: 180,
          enquadramento: "Risco imediato de desabastecimento relevante; poço ou área crítica com risco de inundação; falha crítica de sistema essencial." },
        { id: "p2", rotulo: "Alto", plantao: false, sla_chegada_min: 2880,
          enquadramento: "Falha relevante, mas com condição provisória, redundância parcial ou sem risco imediato à segurança e ao abastecimento geral." },
        { id: "p3", rotulo: "Programável", plantao: false, sla_chegada_min: 4320,
          enquadramento: "Anomalia sem risco imediato; equipamento reserva indisponível sem perda da função principal; ajuste ou corretiva não crítica." },
        { id: "p4", rotulo: "Baixa criticidade", plantao: false, sla_chegada_min: null,
          enquadramento: "Melhorias, levantamentos, adequações, solicitações estéticas ou serviços que dependam de planejamento e orçamento." }
      ],
      categorias: [
        { id: "vazamento",   rotulo: "Vazamento",              prioridade: "p2" },
        { id: "bomba_falha", rotulo: "Falha de bomba",         prioridade: "p2" },
        { id: "nivel_baixo", rotulo: "Nível baixo",            prioridade: "p3" },
        { id: "sem_agua",    rotulo: "Sem água",               prioridade: "p1" },
        { id: "ruido",       rotulo: "Ruído",                  prioridade: "p3" },
        { id: "manutencao",  rotulo: "Manutenção",             prioridade: "p4" },
        { id: "melhoria",    rotulo: "Melhoria / levantamento", prioridade: "p4" },
        { id: "outro",       rotulo: "Outro",                  prioridade: "p3" }
      ]
    });
    var cauda = u.split("/chamados/")[1];
    if (cauda) {
      cauda = cauda.split("?")[0];
      if (cauda.indexOf("/historico") >= 0) return J(HIST);
      if (soDigitos(cauda)) return J(FIX.fila[0]);
    }
    if (u.indexOf("/chamados") >= 0) return J({ id: 9999 });
    return nativo ? nativo(input, init) : J({});
  };
})();
