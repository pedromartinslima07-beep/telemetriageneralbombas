// Confere se a página aberta é o painel deste login (20/11/2026).
//
// O /admin/painel serve o painel novo ou o antigo pelo cookie `gb_painel`.
// Quem acabou de entrar, trocou de login no mesmo navegador ou saiu da lista
// PAINEL_NOVO ainda pode estar com o cookie errado: este script pergunta ao
// servidor (GET /auth/painel, que também acerta o cookie) e, se a resposta
// não bate com o `data-painel` da página, recarrega uma vez.
// Carregado no <head> das duas páginas (public/admin.html e
// public/legado/admin.html). Ver src/services/painel-novo.service.js.
(function () {
  var aqui = document.documentElement.getAttribute("data-painel");
  var token = null;
  try { token = localStorage.getItem("token"); } catch (e) {}
  if (!aqui || !token) return;

  fetch("/auth/painel", {
    headers: { Authorization: "Bearer " + token },
    credentials: "same-origin",
    cache: "no-store",
  })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      if (!j || !j.painel || j.painel === aqui) {
        try { sessionStorage.removeItem("gb_painel_recarga"); } catch (e) {}
        return;
      }
      // Uma recarga só por destino: com cookie bloqueado o servidor
      // continuaria mandando a mesma página, e isso viraria um laço.
      var ja = null;
      try { ja = sessionStorage.getItem("gb_painel_recarga"); } catch (e) {}
      if (ja === j.painel) return;
      try { sessionStorage.setItem("gb_painel_recarga", j.painel); } catch (e) {}
      location.reload();
    })
    .catch(function () {});
})();
