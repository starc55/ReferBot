import "dotenv/config";
import http from "node:http";

import { disconnectDatabase } from "@telegram-referral/database";

import { application } from "./app.js";

const { bot, environment, logger } = application;
const server = http.createServer((request, response) => {
  response.setHeader("Cache-Control", "no-store");
  if (request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ status: "ok", mode: "long-polling" }));
    return;
  }
  response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Telegram referral bot is running");
});

server.listen(environment.PORT, "0.0.0.0", () => {
  logger.info({ port: environment.PORT }, "Health server started");
});

await bot.launch({
  allowedUpdates: ["message", "callback_query", "chat_member"],
});
logger.info({ mode: "long-polling" }, "Telegram bot started");

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Stopping Telegram bot");
  bot.stop(signal);
  server.close();
  await disconnectDatabase();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
