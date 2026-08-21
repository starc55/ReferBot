import type { IncomingMessage, ServerResponse } from "node:http";

export default function handler(
  request: IncomingMessage,
  response: ServerResponse,
): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json");
  if (request.method !== "GET") {
    response.statusCode = 405;
    response.setHeader("Allow", "GET");
    response.end('{"error":"method_not_allowed"}');
    return;
  }
  response.statusCode = 200;
  response.end('{"status":"ok","service":"telegram-referral-webhook"}');
}
