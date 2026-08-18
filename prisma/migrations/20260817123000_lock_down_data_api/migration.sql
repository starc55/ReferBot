-- Application data is available only through the trusted Prisma backend.
-- Supabase Auth remains browser-facing, but anon/authenticated roles must not
-- access these server-owned tables through PostgREST or GraphQL.
REVOKE ALL PRIVILEGES ON TABLE
  "users",
  "challenges",
  "referrals",
  "rewards",
  "fraud_flags",
  "subscription_events",
  "captcha_sessions",
  "telegram_updates",
  "admin_profiles",
  "audit_logs",
  "system_settings"
FROM anon, authenticated;
