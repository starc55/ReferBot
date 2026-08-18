import { z } from "zod";

const emptyToUndefined = (value: unknown): unknown =>
  value === "" ? undefined : value;

const optionalUrl = z.preprocess(emptyToUndefined, z.url().optional());
const optionalString = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(1).optional(),
);
const optionalTelegramId = z.preprocess(
  emptyToUndefined,
  z.string().regex(/^-?\d+$/).optional(),
);
const optionalDate = z.preprocess(
  emptyToUndefined,
  z.coerce.date().optional(),
);
const booleanString = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const commaSeparatedEmails = z.string().transform((value, context) => {
  const emails = value
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  const invalidEmail = emails.find((email) => !z.email().safeParse(email).success);
  if (invalidEmail) {
    context.addIssue({
      code: "custom",
      message: `ADMIN_EMAILS contains an invalid email: ${invalidEmail}`,
    });
    return z.NEVER;
  }

  return [...new Set(emails)];
});

export const serverEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3_000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    BUSINESS_TIMEZONE: z.literal("Asia/Tashkent").default("Asia/Tashkent"),

    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    DIRECT_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    SHADOW_DATABASE_URL: optionalUrl,

    TELEGRAM_BOT_TOKEN: z.string().trim().min(20),
    TELEGRAM_BOT_USERNAME: z.string().trim().min(3).regex(/^[A-Za-z0-9_]+$/),
    TELEGRAM_WEBHOOK_SECRET: z.string().min(32).max(256),
    TELEGRAM_WEBHOOK_URL: optionalUrl,
    MAIN_CHANNEL_ID: optionalTelegramId,
    MAIN_CHANNEL_USERNAME: optionalString,
    REWARD_CHANNEL_ID: optionalTelegramId,
    REWARD_CHANNEL_USERNAME: optionalString,

    ADMIN_FRONTEND_URL: z.url(),
    API_URL: z.url(),
    CORS_ORIGINS: z.string().min(1).transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

    SUPABASE_URL: z.url(),
    SUPABASE_ANON_KEY: z.string().min(20),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
    ADMIN_EMAILS: commaSeparatedEmails,
    REDIS_URL: optionalUrl,

    REFERRAL_TARGET: z.coerce.number().int().positive().default(5),
    CHALLENGE_START_DATE: optionalDate,
    CHALLENGE_END_DATE: optionalDate,
    ALLOW_REFERRAL_RESTORE_ON_REJOIN: booleanString.default(true),
    NOTIFY_REFERRER_ON_INVALIDATION: booleanString.default(true),
    REFERRAL_SUSPICIOUS_THRESHOLD: z.coerce
      .number()
      .int()
      .positive()
      .default(20),
    REFERRAL_SUSPICIOUS_WINDOW_HOURS: z.coerce
      .number()
      .int()
      .positive()
      .default(3),
    MEMBERSHIP_CYCLE_SUSPICIOUS_THRESHOLD: z.coerce
      .number()
      .int()
      .positive()
      .default(3),
    CAPTCHA_TTL_SECONDS: z.coerce.number().int().min(30).max(3_600).default(300),
    CAPTCHA_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
    RATE_LIMIT_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(60),
    RATE_LIMIT_MAX_REQUESTS: z.coerce
      .number()
      .int()
      .positive()
      .default(30),
  })
  .superRefine((environment, context) => {
    if (
      environment.CHALLENGE_START_DATE &&
      environment.CHALLENGE_END_DATE &&
      environment.CHALLENGE_START_DATE >= environment.CHALLENGE_END_DATE
    ) {
      context.addIssue({
        code: "custom",
        path: ["CHALLENGE_END_DATE"],
        message: "CHALLENGE_END_DATE must be after CHALLENGE_START_DATE",
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(
  environment: NodeJS.ProcessEnv = process.env,
): ServerEnv {
  return serverEnvSchema.parse(environment);
}

export const publicEnvKeys = [
  "VITE_API_URL",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
] as const;
