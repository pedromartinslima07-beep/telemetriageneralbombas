
/* ESTUDO SEM TELEMETRIA — arquivo temporário, não versionar. */
localStorage.setItem("token", "harness");
localStorage.setItem("user", JSON.stringify({ nome: "Síndico Bela Vista", role: "cliente", condominio_id: 14 }));

const STATUS = {"condominio":{"id":14,"nome":"DEMO Edifício Sem Telemetria","endereco":"Rua Demonstração, 200","bairro":"Centro","cidade":"Campinas","uf":"SP"},"reservatorios":[],"alertas_abertos":[]};
const CHAMADOS = [{"id":15,"titulo":"Troca de registro do subsolo","status":"fechado","categoria":"manutencao","prioridade":"p4","criado_em":"2026-08-09T17:15:33.844Z","tecnico_nome":"Anderson Luiz","descricao":"—"}];
const j = (o) => Promise.resolve(new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } }));
window.fetch = (url) => {
  const u = String(url);
  if (u.includes("/cliente/status")) return j(STATUS);
  if (/\/cliente\/chamados\/\d+\/mensagens/.test(u)) return j([]);
  if (/\/cliente\/chamados\/\d+$/.test(u)) return j(CHAMADOS[0]);
  if (u.includes("/cliente/chamados")) return j(CHAMADOS);
  return j({});
};

/* ── As candidatas ──────────────────────────────────────────────────────
   Cada uma é CSS + DOM por cima da tela real. ⚠️ A copy marcada como
   PROPOSTA (B e C) não está decidida — é do Pedro. */
const V = {
  hoje: { rot: "Hoje", css: "", montar() {} },

  A: {
    rot: "A · Silêncio",
    css: `
      /* A primeira tela deixa de reservar a janela: para este cliente o
         conteúdo do painel É a história, e uma tela inteira dizendo o que
         ele não tem fica entre ele e o que interessa. */
      .resposta { min-height: 0 !important; padding: 36px 0 40px !important; }
      body[data-estado="semtel"] .placa { max-width: 100% !important; }
      body[data-estado="semtel"] .eng { display: none; }
      body[data-estado="semtel"] .placa-topo + .placa-cel {
        display: grid; grid-template-columns: minmax(0, 1fr) auto;
        align-items: center; gap: 44px; padding: 30px clamp(24px, 3vw, 40px);
      }
      body[data-estado="semtel"] .frase {
        font-size: 1.66rem !important; line-height: 1.24; max-width: 30ch;
        letter-spacing: -.022em;
      }
      body[data-estado="semtel"] .apoio {
        font-size: 1rem !important; color: var(--sobre-2) !important;
        max-width: 56ch; margin-top: 9px !important;
      }
      body[data-estado="semtel"] .rodape-resposta { margin-top: 0 !important; flex-wrap: nowrap; gap: 12px; }
      body[data-estado="semtel"] .quero, body[data-estado="semtel"] .ajuda { white-space: nowrap; }
    `,
    montar() {
      const cel = document.querySelector(".placa-topo + .placa-cel");
      cel.appendChild(document.querySelector(".rodape-resposta"));
    },
  },

  B: {
    rot: "B · A oferta",
    css: `
      body[data-estado="semtel"] .placa { max-width: 100% !important; }
      body[data-estado="semtel"] .placa-cel + .placa-cel { display: flex !important; }
      /* a celula de texto volta a ocupar UMA trilha: no CSS no ar ela
         atravessa a placa (grid-column: 1/-1) porque a prova nao existe */
      body[data-estado="semtel"] .placa-topo + .placa-cel { grid-column: auto !important; }
      body[data-estado="semtel"] .eng { opacity: .1; }
      body[data-estado="semtel"] .frase { font-size: clamp(2rem, 9cqi, 3rem) !important; }
      body[data-estado="semtel"] .apoio { font-size: 1.1rem !important; max-width: 40ch; color: var(--sobre-2) !important; }
      .oferta { display: block; min-width: 34ch; }
      .oferta dt {
        font-family: var(--mono); font-size: .6rem; font-weight: 500;
        letter-spacing: .12em; text-transform: uppercase; color: var(--sobre-2);
        padding-bottom: 16px;
      }
      .oferta div {
        padding: 15px 0; display: flex; gap: 14px; align-items: baseline;
        border-top: 1px solid var(--rasgo); box-shadow: 0 -1px 0 var(--luz);
      }
      .oferta b { font-size: 1.05rem; font-weight: 700; font-stretch: 104%; color: #fff; line-height: 1.3; }
      .oferta i {
        font-style: normal; font-family: var(--mono); font-size: .6rem; font-weight: 700;
        color: var(--amarelo); flex: 0 0 auto; letter-spacing: .06em;
      }
      /* neste estado a oferta é a ação principal: ela leva o amarelo */
      body[data-estado="semtel"] .quero { background: var(--amarelo) !important; color: var(--mar-900) !important; }
      body[data-estado="semtel"] .quero::before { display: none !important; }
      body[data-estado="semtel"] .ajuda { background: transparent; color: #fff; box-shadow: inset 0 0 0 1px var(--fio); }
    `,
    montar() {
      document.querySelectorAll(".placa-cel")[1].innerHTML = `<dl class="oferta">
          <dt>Com o sensor, esta tela passa a mostrar</dt>
          <div><i>01</i><b>O nível de cada reservatório, o tempo todo</b></div>
          <div><i>02</i><b>A bomba ligada ou parada</b></div>
          <div><i>03</i><b>Um aviso antes de faltar água</b></div>
        </dl>`;
      const rod = document.querySelector(".rodape-resposta");
      rod.insertBefore(document.getElementById("quero"), rod.firstChild);
    },
  },

  C: {
    rot: "C · O contrato",
    css: `
      body[data-estado="semtel"] .placa { max-width: 100% !important; }
      body[data-estado="semtel"] .placa-cel + .placa-cel { display: flex !important; }
      /* a celula de texto volta a ocupar UMA trilha: no CSS no ar ela
         atravessa a placa (grid-column: 1/-1) porque a prova nao existe */
      body[data-estado="semtel"] .placa-topo + .placa-cel { grid-column: auto !important; }
      body[data-estado="semtel"] .eng { opacity: .1; }
      body[data-estado="semtel"] .frase { font-size: clamp(2rem, 9cqi, 3rem) !important; max-width: 17ch; }
      body[data-estado="semtel"] .apoio { font-size: 1.1rem !important; max-width: 42ch; color: var(--sobre-2) !important; }
      .servico { display: grid; gap: 24px; min-width: 32ch; }
      .servico > div { display: grid; gap: 5px; }
      .servico dt {
        font-family: var(--mono); font-size: .6rem; font-weight: 500;
        letter-spacing: .12em; text-transform: uppercase; color: var(--sobre-2);
      }
      .servico dd { margin: 0; font-size: 1.05rem; font-weight: 700; font-stretch: 104%; color: #fff; line-height: 1.35; }
      .servico dd small { display: block; font-size: .88rem; font-weight: 400; color: var(--sobre-2); margin-top: 4px; }
    `,
    montar() {
      document.querySelectorAll(".placa-cel")[1].innerHTML = `<dl class="servico">
          <div><dt>Última visita</dt><dd>Anderson Luiz esteve no prédio<small>9 de agosto · troca de registro do subsolo</small></dd></div>
          <div><dt>Chamados em aberto</dt><dd>Nenhum<small>o último foi encerrado no mesmo dia</small></dd></div>
        </dl>`;
      document.getElementById("frase").textContent = "Seu prédio está em manutenção com a General.";
      document.getElementById("apoio").textContent = "O que ainda não temos é o sensor que mede o nível dos reservatórios e avisa antes de faltar água.";
    },
  },
};

// trocar só o hash não recarrega o documento, e a variante já foi aplicada:
// sem isto, abrir #v=B depois de #v=A mostra A e ninguém percebe
window.addEventListener("hashchange", () => location.reload());

window.addEventListener("load", async () => {
  await carregar();
  await new Promise(r => setTimeout(r, 120));
  const v = new URLSearchParams(location.hash.slice(1)).get("v") || "hoje";
  const cand = V[v] || V.hoje;
  if (cand.css) { const s = document.createElement("style"); s.textContent = cand.css; document.head.appendChild(s); }
  cand.montar();
  document.documentElement.dataset.v = v;
}, { once: true });
