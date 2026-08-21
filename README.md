# Telegram Referral Challenge Platform

Production-oriented Telegram referral challenge platform built as a TypeScript workspace. It includes idempotent onboarding, opaque referral attribution, one-use captcha, Telegram membership verification, progress and ranking screens, automatic referrer notifications, and gated reward-channel access.

## Phase 1 prerequisites

- Node.js 22.13 or newer
- npm 11 or newer
- PostgreSQL 15+ (Neon Free is the production default)

## Setup

1. Copy `.env.example` to `.env` and replace every required blank value.
2. Create a Neon project and use its pooled connection string for `DATABASE_URL`.
3. Use the matching direct Neon connection string for `DIRECT_URL`; Prisma migrations must not use the pooler.
4. Keep `sslmode=verify-full` in both connection strings.
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

Application tables are server-only. Browser code never connects directly to PostgreSQL; all application data goes through authenticated backend endpoints backed by Prisma.

Never place `DATABASE_URL`, `DIRECT_URL`, or `TELEGRAM_BOT_TOKEN` in Vite-prefixed variables or browser code.

See [docs/architecture.md](docs/architecture.md) for the system boundaries and invariants.

## Bot startup

Before starting the bot, configure at least the database values plus:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME` without `@`
- `TELEGRAM_WEBHOOK_SECRET` with at least 32 characters
- `MAIN_CHANNEL_ID`
- `MAIN_CHANNEL_USERNAME`

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
2. Configure the production environment variables from `.env`. Set `NODE_ENV=production` and `TELEGRAM_WEBHOOK_URL=https://<production-domain>/api/telegram`.
3. Use Neon's pooled URL for `DATABASE_URL` and its direct URL for `DIRECT_URL`.
4. Deploy and verify `GET /api/health` returns HTTP 200.
5. Run `npm run telegram:configure` with the production values loaded. This sets bot commands and an authenticated webhook without printing the bot token or webhook secret.
6. Check `getWebhookInfo` reports the production URL, zero pending updates, and no last error.

The webhook rejects every request without Telegram’s `X-Telegram-Bot-Api-Secret-Token` header. `.vercelignore` excludes every `.env` file from deployment uploads.
