const express = require("express");
const { receberWebhook } = require("../controllers/whatsapp.controller");

const router = express.Router();

router.post("/webhook", receberWebhook);

module.exports = { whatsappRouter: router };
