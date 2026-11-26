// Maquete: orçamento e nota com estrutura nova (26/11/2026). Só alterna tela
// e situação, abre o item clicado e o menu de resposta. Sem API. Ver
// public/_documentos-preview.html.
(function () {
  const est = { tela: "orc", orc: "rascunho", nf: "falta" };
  try { Object.assign(est, JSON.parse(localStorage.getItem("mq-documentos") || "{}")); } catch (_) {}

  const tem = (lista, v) => String(lista || "").split(/\s+/).includes(v);

  function aplicar() {
    document.querySelectorAll("[data-tela]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tela === est.tela)));
    document.querySelectorAll("[data-orc]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.orc === est.orc)));
    document.querySelectorAll("[data-nf]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.nf === est.nf)));
    document.querySelectorAll("[data-so-tela]").forEach(el => { el.hidden = el.dataset.soTela !== est.tela; });
    document.querySelectorAll("[data-so-orc]").forEach(el => { el.hidden = !tem(el.dataset.soOrc, est.orc); });
    document.querySelectorAll("[data-so-nf]").forEach(el => { el.hidden = !tem(el.dataset.soNf, est.nf); });
    for (const [attr, chave] of [["classeOrc", "orc"], ["classeNf", "nf"]]) {
      document.querySelectorAll(`[data-${attr === "classeOrc" ? "classe-orc" : "classe-nf"}]`).forEach(li => {
        const mapa = JSON.parse(li.dataset[attr]);
        li.classList.remove("is-feito", "is-atual");
        if (mapa[est[chave]]) li.classList.add(mapa[est[chave]]);
      });
    }
    // Enviado/aprovado e nota emitida não se editam: campos viram leitura.
    const leitura = (est.tela === "orc" && est.orc !== "rascunho") || (est.tela === "nf" && est.nf === "emitida");
    document.querySelectorAll("[data-edita]").forEach(c => { c.disabled = leitura; });
    document.querySelectorAll(".it-novo").forEach(r => { r.hidden = est.orc !== "rascunho"; });
    try { localStorage.setItem("mq-documentos", JSON.stringify(est)); } catch (_) {}
  }

  document.addEventListener("click", e => {
    const t = e.target;
    const b = t.closest("[data-tela],[data-orc],[data-nf]");
    if (b) {
      if (b.dataset.tela) est.tela = b.dataset.tela;
      if (b.dataset.orc) est.orc = b.dataset.orc;
      if (b.dataset.nf) est.nf = b.dataset.nf;
      aplicar(); return;
    }
    const abre = t.closest("[data-abre-menu]");
    document.querySelectorAll("[data-menu]").forEach(m => { if (!abre || m.dataset.menu !== abre.dataset.abreMenu) m.hidden = true; });
    if (abre) { const m = document.querySelector(`[data-menu="${abre.dataset.abreMenu}"]`); m.hidden = !m.hidden; return; }
    // Clicar num item fechado "abre" o item (só mostra que abre; a maquete
    // tem um item aberto desenhado, o 3º).
    const it = t.closest("tr.it:not(.is-aberto)");
    if (it && !t.closest("button")) {
      it.animate([{ background: "#e6edf8" }, { background: "transparent" }], { duration: 500 });
    }
    if (t.closest("a[href='#']")) e.preventDefault();
  });

  aplicar();
  window.lucide?.createIcons?.();
})();
