// Logout automático por inatividade
(function () {
  const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos
  let _timer = null;

  function logout() {
    localStorage.removeItem("token");
    window.location.href = "/login?motivo=inatividade";
  }

  function resetTimer() {
    clearTimeout(_timer);
    _timer = setTimeout(logout, TIMEOUT_MS);
  }

  ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"].forEach(
    (ev) => document.addEventListener(ev, resetTimer, { passive: true })
  );

  resetTimer();
})();
