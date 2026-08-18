import { describe, expect, it } from "vitest";

import { parseServerEnv } from "./env.js";

const validEnvironment = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/app",
  DIRECT_URL: "postgresql://user:pass@localhost:5432/app",
  TELEGRAM_BOT_TOKEN: "123456789:abcdefghijklmnopqrstuvwxyz",
  TELEGRAM_BOT_USERNAME: "referral_test_bot",
  TELEGRAM_WEBHOOK_SECRET: "a".repeat(32),
  ADMIN_FRONTEND_URL: "http://localhost:5173",
  API_URL: "http://localhost:3000",
  CORS_ORIGINS: "http://localhost:5173",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_ANON_KEY: "a".repeat(24),
  SUPABASE_SERVICE_ROLE_KEY: "b".repeat(24),
  ADMIN_EMAILS: "admin@example.com",
} satisfies NodeJS.ProcessEnv;

describe("parseServerEnv", () => {
  it("parses defaults and approved admin emails", () => {
    const environment = parseServerEnv(validEnvironment);

    expect(environment.BUSINESS_TIMEZONE).toBe("Asia/Tashkent");
    expect(environment.REFERRAL_TARGET).toBe(5);
    expect(environment.ADMIN_EMAILS).toEqual(["admin@example.com"]);
  });

  it("rejects an invalid challenge window", () => {
    expect(() =>
      parseServerEnv({
        ...validEnvironment,
        CHALLENGE_START_DATE: "2026-09-15T00:00:00+05:00",
        CHALLENGE_END_DATE: "2026-09-01T00:00:00+05:00",
      }),
    ).toThrow(/CHALLENGE_END_DATE/);
  });

  it("requires a webhook URL in production", () => {
    expect(() =>
      parseServerEnv({ ...validEnvironment, NODE_ENV: "production" }),
    ).toThrow(/TELEGRAM_WEBHOOK_URL/);
  });

  it("accepts an empty webhook URL during long-polling development", () => {
    const environment = parseServerEnv({
      ...validEnvironment,
      TELEGRAM_WEBHOOK_URL: "",
    });

    expect(environment.TELEGRAM_WEBHOOK_URL).toBeUndefined();
  });
});
