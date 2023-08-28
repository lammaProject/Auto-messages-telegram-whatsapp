import express from "express";
const app = express();
const port = 3000;

import { startWhats } from "./whatsAppApi/src/whatsApi.js";
import { startsTelegram } from "./telegramAppApi/src/telegramApi.js";

app.listen(port, () => {
  startWhats();
  startsTelegram();
  console.log("Start");
});
