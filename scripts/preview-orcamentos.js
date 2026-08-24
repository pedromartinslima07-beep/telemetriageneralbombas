// Pré-visualização da tela de orçamento do cliente, SEM banco e SEM login.
//
//   node scripts/preview-orcamentos.js
//   → http://localhost:4599/cliente/painel/orcamentos?orc=12
//
// Serve os arquivos REAIS de public/ (cliente-orcamentos.html/.js, cliente.css)
// e dubla apenas o fetch das quatro rotas de /cliente/orcamentos. Serve para
// ver desenho e casos-limite; NÃO prova nada sobre o backend.
//
// Cenários, pelo ?cena= na URL da página:
//   completo   (padrão) · orçamento com tudo preenchido, aguardando resposta
//   minimo              · nenhum campo opcional, item sem preço lançado
//   aprovado            · já respondido, com comentário do cliente
//   divergente          · recusado, e a soma dos itens difere do total
//   varios              · a LISTA com seis orçamentos em estados misturados
//
// ⚠️ O ?cena= é lido do Referer nas chamadas de API: o fetch do JS não
// carrega o parâmetro da página que o disparou.
//
// Este arquivo é ferramenta de desenvolvimento. Pode apagar sem dó.
const http = require("http");
const fs = require("fs");
const path = require("path");

const RAIZ = process.argv[2] || path.resolve(__dirname, "..");

const CENAS = {
  completo: {
    condominio: "Residencial Aurora",
    orcamentos: [{ id: 12, numero: "ORC-2026-0184", status: "enviado", valor_total: 6460, itens: 4, enviado_em: "2026-08-20T13:00:00Z" }],
    detalhe: {
      id: 12, numero: "ORC-2026-0184", status: "enviado", tipo: "pecas",
      constatacao: "A bomba 2 do barrilete está com o selo mecânico vazando e o rolamento do lado acoplado com folga. O conjunto ainda funciona, mas o vazamento molha o quadro de comando, e é isso que precisa parar antes de virar problema elétrico.",
      forma_pagamento: "50% na aprovação, 50% na entrega", prazo_entrega: "5 dias úteis após a aprovação",
      garantia: "12 meses para peças e serviço",
      valido_ate: "2026-09-19T00:00:00Z", enviado_em: "2026-08-20T13:00:00Z",
      valor_total: 6460,
      linhas: [
        { id: 1, descricao: "Selo mecânico 1.1/4\" em carbono/cerâmica", quantidade: 2, valor_unitario: 780, ficha_tecnica: null },
        { id: 2, descricao: "Rolamento blindado 6206 ZZ", quantidade: 4, valor_unitario: 165, ficha_tecnica: null },
        { id: 3, descricao: "Limpeza e desinfecção dos reservatórios", quantidade: 1, valor_unitario: 3200, tipo_servico: "limpeza_reservatorio",
          ficha_tecnica: "Esvaziamento, remoção de sedimento, escovação das paredes e do fundo, desinfecção com solução clorada a 50 mg/L por 2 horas, enxágue e laudo com ART." },
        { id: 4, descricao: "Mão de obra de montagem e alinhamento", quantidade: 8, valor_unitario: 130, ficha_tecnica: null },
      ],
    },
  },
  minimo: {
    condominio: "Edifício Bandeirantes",
    orcamentos: [{ id: 7, numero: "ORC-2026-0090", status: "enviado", valor_total: 450, itens: 1, enviado_em: null }],
    detalhe: {
      id: 7, numero: "ORC-2026-0090", status: "enviado", tipo: "dedetizacao",
      constatacao: null, forma_pagamento: null, prazo_entrega: null, garantia: null,
      valido_ate: null, enviado_em: null, valor_total: 450,
      linhas: [{ id: 1, descricao: "Dedetização das áreas comuns", quantidade: 1, valor_unitario: null, ficha_tecnica: null }],
    },
  },
  aprovado: {
    condominio: "Residencial Aurora",
    orcamentos: [{ id: 3, numero: "ORC-2026-0031", status: "aprovado", valor_total: 2100, itens: 2, enviado_em: "2026-07-02T13:00:00Z" }],
    detalhe: {
      id: 3, numero: "ORC-2026-0031", status: "aprovado", tipo: "limpeza_reservatorio",
      constatacao: "Limpeza semestral vencida desde maio.",
      forma_pagamento: "À vista", prazo_entrega: "3 dias úteis", garantia: null,
      valido_ate: "2026-08-02T00:00:00Z", enviado_em: "2026-07-02T13:00:00Z",
      respondido_em: "2026-07-04T18:20:00Z",
      cliente_comentario: "Pode fazer, mas só depois do dia 10 — temos assembleia dia 8 e o salão fica cheio.",
      valor_total: 2100,
      linhas: [
        { id: 1, descricao: "Limpeza do reservatório inferior 27.000 L", quantidade: 1, valor_unitario: 1400, ficha_tecnica: null },
        { id: 2, descricao: "Limpeza do reservatório superior 10.000 L", quantidade: 1, valor_unitario: 700, ficha_tecnica: null },
      ],
    },
  },
  // Lista com vários, em estados misturados — o backend ordena os
  // 'enviado' primeiro, depois por data decrescente, e a fixture reproduz isso.
  varios: {
    condominio: "Residencial Aurora",
    orcamentos: [
      { id: 12, numero: "ORC-2026-0184", status: "enviado",   valor_total: 6460, itens: 4, enviado_em: "2026-08-20T13:00:00Z" },
      { id: 11, numero: "ORC-2026-0177", status: "enviado",   valor_total: 1280, itens: 2, enviado_em: "2026-08-14T13:00:00Z" },
      { id: 9,  numero: "ORC-2026-0142", status: "aprovado",  valor_total: 12750.9, itens: 7, enviado_em: "2026-07-28T13:00:00Z" },
      { id: 20, numero: "ORC-2026-0200", status: "rejeitado", valor_total: 5000, itens: 2, enviado_em: "2026-08-01T13:00:00Z" },
      { id: 3,  numero: "ORC-2026-0031", status: "aprovado",  valor_total: 2100, itens: 2, enviado_em: "2026-07-02T13:00:00Z" },
      { id: 1,  numero: "ORC-2026-0004", status: "rejeitado", valor_total: 890, itens: 1, enviado_em: "2026-05-19T13:00:00Z" },
    ],
    detalhe: null,   // preenchido abaixo, reaproveitando o cenário completo
  },

  divergente: {
    condominio: "Residencial Aurora",
    orcamentos: [{ id: 20, numero: "ORC-2026-0200", status: "rejeitado", valor_total: 5000, itens: 2, enviado_em: "2026-08-01T13:00:00Z" }],
    detalhe: {
      id: 20, numero: "ORC-2026-0200", status: "rejeitado", tipo: "limpeza_dedetizacao",
      constatacao: null, forma_pagamento: "Boleto 30 dias", prazo_entrega: null, garantia: "6 meses",
      valido_ate: "2026-09-01T00:00:00Z", enviado_em: "2026-08-01T13:00:00Z",
      respondido_em: "2026-08-05T10:00:00Z",
      cliente_comentario: null,
      motivo_rejeicao: "Valor acima do que a assembleia aprovou para manutenção neste semestre. Conseguem rever o item de mão de obra?",
      valor_total: 5000,
      linhas: [
        { id: 1, descricao: "Limpeza dos reservatórios", quantidade: 1, valor_unitario: 3200, ficha_tecnica: null },
        { id: 2, descricao: "Dedetização completa", quantidade: 1, valor_unitario: 2400, ficha_tecnica: null },
      ],
    },
  },
};

// Clicar num item do cenário `varios` abre o mesmo documento do `completo`:
// aqui o que se está olhando é a LISTA, não o detalhe.
CENAS.varios.detalhe = CENAS.completo.detalhe;

const TIPOS = { ".css": "text/css", ".js": "application/javascript", ".png": "image/png", ".woff2": "font/woff2", ".html": "text/html" };

http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  // O ?cena= vive na URL DA PÁGINA; o fetch do JS não o carrega. Para as
  // chamadas de API, a cena vem do Referer — que é a página que as disparou.
  const ref = req.headers.referer ? new URL(req.headers.referer) : null;
  const nome = u.searchParams.get("cena") || (ref && ref.searchParams.get("cena"));
  const cena = CENAS[nome] || CENAS.completo;

  if (u.pathname === "/cliente/orcamentos") {
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ condominio: cena.condominio, orcamentos: cena.orcamentos }));
  }
  if (u.pathname.startsWith("/cliente/orcamentos/")) {
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify(cena.detalhe));
  }

  if (u.pathname.startsWith("/static/")) {
    const f = path.join(RAIZ, "public", u.pathname.replace("/static/", ""));
    if (fs.existsSync(f)) {
      res.setHeader("Content-Type", TIPOS[path.extname(f)] || "application/octet-stream");
      return res.end(fs.readFileSync(f));
    }
    res.statusCode = 404; return res.end("");
  }

  // a página real, com o token dublado antes do script (o script redireciona
  // para /login se não achar token no localStorage)
  let html = fs.readFileSync(path.join(RAIZ, "public", "cliente-orcamentos.html"), "utf8");
  html = html.replace(
    "<body>",
    "<body>\n<script>localStorage.setItem('token','andaime');</script>"
  );
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html);
}).listen(4599, () => {
  console.log("Pré-visualização em http://localhost:4599/cliente/painel/orcamentos?orc=12");
  console.log("Cenários: ?cena=completo | minimo | aprovado | divergente");
});
