// Carrega .env apenas em desenvolvimento (em prod as vars vêm do ambiente)
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const { app } = require("./src/app");
const { pool } = require("./src/db");

const PORT = Number(process.env.PORT || 3001);

const server = app.listen(PORT, () =>
  console.log(`Servidor rodando na porta ${PORT}`)
);

// Graceful shutdown — fecha conexões ao receber sinal de encerramento
async function shutdown(signal) {
  console.log(`${signal} recebido. Encerrando servidor...`);
  server.close(async () => {
    await pool.end();
    console.log("Servidor encerrado.");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
