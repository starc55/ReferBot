import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { application } from "../apps/bot/src/app.js";

type VercelRequest = IncomingMessage & { body?: unknown };

function secretsMatch(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

async function readJsonBody(request: VercelRequest): Promise<unknown> {
  if (request.body !== undefined) {
    if (typeof request.body === "string") return JSON.parse(request.body);
    if (request.body instanceof Uint8Array) {
      return JSON.parse(Buffer.from(request.body).toString("utf8"));
    }
    return request.body;
  }
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    if (typeof chunk === "string") chunks.push(Buffer.from(chunk));
    else if (chunk instanceof Uint8Array) chunks.push(chunk);
    else throw new Error("Unsupported webhook request body chunk");
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export default async function handler(
  request: VercelRequest,
  response: ServerResponse,
): Promise<void> {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") {
    response.statusCode = 405;
    response.setHeader("Allow", "POST");
    response.end("Method Not Allowed");
    return;
  }

  const suppliedSecret = request.headers[
    "x-telegram-bot-api-secret-token"
  ];
  const secret = Array.isArray(suppliedSecret)
    ? suppliedSecret[0]
    : suppliedSecret;
  if (!secretsMatch(secret, application.environment.TELEGRAM_WEBHOOK_SECRET)) {
    response.statusCode = 401;
    response.end("Unauthorized");
    return;
  }

  try {
    const update = await readJsonBody(request);
    await application.bot.handleUpdate(
      update as Parameters<typeof application.bot.handleUpdate>[0],
    );
    response.statusCode = 200;
    response.setHeader("Content-Type", "application/json");
    response.end('{"ok":true}');
  } catch (error) {
    application.logger.error({ error }, "Webhook update failed");
    response.statusCode = 500;
    response.end("Internal Server Error");
  }
}
