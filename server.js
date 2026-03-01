require("dotenv").config();

const { app } = require("./src/app");

const PORT = Number(process.env.PORT || 3001);

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));