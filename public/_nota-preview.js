// Maquete da tela de nota (23/11/2026): só alterna opção e estado e abre a
// prévia do DANFE. Sem API. Ver public/_nota-preview.html.
(function () {
  const estado = { op: "a", est: "rascunho" };

  function aplicar() {
    document.querySelectorAll("[data-op]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.op === estado.op)));
    document.querySelectorAll("[data-estado]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.estado === estado.est)));
    document.querySelectorAll("[data-op-tela]").forEach(s => { s.hidden = s.dataset.opTela !== estado.op; });
    document.querySelectorAll("[data-estado-tela]").forEach(el => { el.hidden = el.dataset.estadoTela !== estado.est; });
    document.body.classList.toggle("is-emitida", estado.est === "emitida");
    // Emitida não se edita: os campos viram leitura.
    document.querySelectorAll("[data-op-tela=b] textarea").forEach(t => { t.readOnly = estado.est === "emitida"; });
    try { localStorage.setItem("mq-nota", JSON.stringify(estado)); } catch (_) {}
  }

  try { Object.assign(estado, JSON.parse(localStorage.getItem("mq-nota") || "{}")); } catch (_) {}

  document.addEventListener("click", e => {
    const op = e.target.closest("[data-op]");
    if (op) { estado.op = op.dataset.op; aplicar(); return; }
    const est = e.target.closest("[data-estado]");
    if (est) { estado.est = est.dataset.estado; aplicar(); return; }
    if (e.target.closest("[data-danfe]")) { document.getElementById("danfe").hidden = false; return; }
    if (e.target.closest("[data-danfe-fechar]") || e.target.id === "danfe") { document.getElementById("danfe").hidden = true; return; }
    if (e.target.closest("a[href='#']")) e.preventDefault();
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") document.getElementById("danfe").hidden = true; });

  aplicar();
})();
