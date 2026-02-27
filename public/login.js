document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value;
  const senha = document.getElementById("senha").value;
  const erroMsg = document.getElementById("erroMsg");

  erroMsg.textContent = "";

  try {
    const response = await fetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, senha }),
    });

    const data = await response.json();

    if (!response.ok) {
      erroMsg.textContent = data.error || "Erro ao fazer login";
      return;
    }

    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));

    // Redireciona conforme o tipo
    if (data.user.role === "admin") {
      window.location.href = "/admin/painel";
    } else {
      window.location.href = "/cliente/painel";
    }
  } catch (err) {
    erroMsg.textContent = "Erro de conexão com servidor";
  }
});