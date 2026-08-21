# Telegram Referral Challenge Platform

Production-oriented Telegram referral challenge platform built as a TypeScript workspace. It includes idempotent onboarding, opaque referral attribution, one-use captcha, Telegram membership verification, progress and ranking screens, automatic referrer notifications, and gated reward-channel access.

## Phase 1 prerequisites

- Node.js 22.13 or newer
- npm 11 or newer
- PostgreSQL 15+ or a Supabase project

## Setup

1. Copy `.env.example` to `.env` and replace every required blank value.
2. In Supabase, create a dedicated Prisma database role as described in the official Prisma integration guide.
3. Use a direct PostgreSQL connection for `DIRECT_URL`. If the deployment network is IPv4-only, use Supavisor session mode on port 5432. Do not use transaction mode for Prisma migrations.
4. Use a direct or session-mode connection for the persistent API's `DATABASE_URL`.
5. Install and validate:

   ```bash
   npm install
   npm run prisma:validate
   npm run prisma:generate
   npm run prisma:migrate:deploy
   npm run typecheck
   npm run lint
   npm test
   npm run build
   ```

`prisma migrate deploy` is the production-safe command. Use `npm run prisma:migrate:dev -- --name <change-name>` only against a development database.

## Database security

Application tables are server-only. The initial migration enables row-level security without creating `anon` or `authenticated` policies. The admin frontend uses Supabase Auth for identity, then calls the backend; it does not read application tables using the Supabase Data API.

Never place `DATABASE_URL`, `DIRECT_URL`, `TELEGRAM_BOT_TOKEN`, or `SUPABASE_SERVICE_ROLE_KEY` in Vite-prefixed variables or browser code.

See [docs/architecture.md](docs/architecture.md) for the system boundaries and invariants.

## Bot startup

Before starting the bot, configure at least the database values plus:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME` without `@`
- `TELEGRAM_WEBHOOK_SECRET` with at least 32 characters
- `MAIN_CHANNEL_ID`
- `MAIN_CHANNEL_USERNAME`
- Supabase URL/keys required by the central environment validator

Add the bot to the required channel as an administrator. Telegram only guarantees reliable `getChatMember` checks for other users when the bot is a channel administrator.

Run the development bot with:

```bash
npm run dev -w @telegram-referral/bot
```

The development runtime uses long polling. Production uses the authenticated HTTPS handler at `/api/telegram`.

### Onboarding behavior

1. `/start` is claimed by Telegram `update_id`, so duplicate delivery is ignored.
2. The Telegram profile is upserted by unique `telegram_id`.
3. A valid `ref_<opaque-code>` payload may create one `PENDING` referral during an active challenge.
4. Existing attribution is never changed. Self-referrals and reassignment attempts are fraud-audited.
5. New users receive a short-lived captcha nonce. Only its SHA-256 hash is stored.
6. Successful captcha use is transactional, tied to the Telegram user, one-use, expiring, and attempt-limited.

`/start` and captcha alone do not confirm referral credit. The user must press “Obunani tekshirish”; the bot calls Telegram `getChatMember` and transactionally changes an eligible referral from `PENDING` to `CONFIRMED`. After verification the bot displays the user's opaque personal referral link; `/ref` displays it again for verified subscribers.

## Production deployment on Vercel

1. Create a Vercel project from this repository and keep the root directory at the repository root.
2. Configure the production environment variables from `.env`. Set `NODE_ENV=production`, `DATABASE_SSL_CA_PATH=certs/supabase-prod-ca-2021.crt`, and `TELEGRAM_WEBHOOK_URL=https://<production-domain>/api/telegram`.
3. Use the Supabase Supavisor pooler for `DATABASE_URL`; keep `DIRECT_URL` on session/direct mode for migrations.
4. Deploy and verify `GET /api/health` returns HTTP 200.
5. Run `npm run telegram:configure` with the production values loaded. This sets bot commands and an authenticated webhook without printing the bot token or webhook secret.
6. Check `getWebhookInfo` reports the production URL, zero pending updates, and no last error.

The webhook rejects every request without Telegram’s `X-Telegram-Bot-Api-Secret-Token` header. `.vercelignore` excludes every `.env` file from deployment uploads.
