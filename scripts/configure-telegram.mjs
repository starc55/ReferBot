/* global console, fetch, process */
import "dotenv/config";

const token = process.env.TELEGRAM_BOT_TOKEN;
const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token || !webhookUrl || !webhookSecret) {
  throw new Error(
    "TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_URL and TELEGRAM_WEBHOOK_SECRET are required",
  );
}
if (!webhookUrl.startsWith("https://")) {
  throw new Error("TELEGRAM_WEBHOOK_URL must use HTTPS");
}

async function telegram(method, body = {}) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(`${method} failed: ${result.description ?? response.status}`);
  }
  return result.result;
}

const bot = await telegram("getMe");
await telegram("setMyCommands", {
  commands: [
    { command: "start", description: "Challenge’ni boshlash" },
    { command: "stats", description: "Natija va progress" },
    { command: "top", description: "TOP referrerlar" },
    { command: "ref", description: "Referral linkni ulashish" },
    { command: "help", description: "Asosiy menyu" },
  ],
});
await telegram("setWebhook", {
  url: webhookUrl,
  secret_token: webhookSecret,
  allowed_updates: ["message", "callback_query", "chat_member"],
  drop_pending_updates: false,
  max_connections: 40,
});
const webhook = await telegram("getWebhookInfo");

console.log(
  JSON.stringify(
    {
      bot: `@${bot.username}`,
      webhookUrl: webhook.url,
      pendingUpdateCount: webhook.pending_update_count,
      lastErrorMessage: webhook.last_error_message ?? null,
      hasCustomCertificate: webhook.has_custom_certificate,
    },
    null,
    2,
  ),
);
