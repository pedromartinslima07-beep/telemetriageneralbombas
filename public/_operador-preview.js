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
  var nativo = window.fetch ? window.fetch.bind(window) : null;

  function J(o) {
    return Promise.resolve(new Response(JSON.stringify(o), {
      status: 200, headers: { "content-type": "application/json" },
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
          { prioridade: "p2", ttfr_min: 60,   sla_chegada_min: 1440, ttr_min: 1440 },
          { prioridade: "p3", ttfr_min: 240,  sla_chegada_min: 4320, ttr_min: 4320 },
          { prioridade: "p4", ttfr_min: 1440, sla_chegada_min: null, ttr_min: 14400 },
        ],
        limiares: { baixo: 45, critico: 20 },
        offline_min: 10,
      });
    }
    if (u.indexOf("/admin/me") >= 0) return J({ id: 1, nome: "Ana Paula Souza", role: "operador" });
    if (u.indexOf("/condominios") >= 0) {
      return J([{ id: 12, nome: "Edifício Aurora Paulista" }, { id: 7, nome: "Residencial Vila Mariana" }]);
    }
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
