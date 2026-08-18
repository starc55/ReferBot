import pino, { type Logger } from "pino";

const sensitivePaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "authorization",
  "password",
  "token",
  "TELEGRAM_BOT_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "DIRECT_URL",
] as const;

export function createLogger(name: string, level = "info"): Logger {
  return pino({
    name,
    level,
    redact: {
      paths: [...sensitivePaths],
      censor: "[REDACTED]",
    },
  });
}
