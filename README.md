# Telegram Referral Challenge Platform

Production-oriented Telegram referral challenge platform built as a TypeScript workspace. Phase 1 establishes strict configuration, the PostgreSQL/Prisma data model, security constraints, and the initial migration. Phase 2 adds idempotent `/start` onboarding, opaque referral attribution, and expiring one-use captcha callbacks. Phase 3 verifies Telegram channel membership and confirms eligible referrals transactionally.

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

The current development runtime uses long polling and requests `message` and `callback_query` updates. Production webhook delivery and passive `chat_member` unsubscribe tracking are introduced in later phases.

### Onboarding behavior

1. `/start` is claimed by Telegram `update_id`, so duplicate delivery is ignored.
2. The Telegram profile is upserted by unique `telegram_id`.
3. A valid `ref_<opaque-code>` payload may create one `PENDING` referral during an active challenge.
4. Existing attribution is never changed. Self-referrals and reassignment attempts are fraud-audited.
5. New users receive a short-lived captcha nonce. Only its SHA-256 hash is stored.
6. Successful captcha use is transactional, tied to the Telegram user, one-use, expiring, and attempt-limited.

`/start` and captcha alone do not confirm referral credit. The user must press “Obunani tekshirish”; the bot calls Telegram `getChatMember` and transactionally changes an eligible referral from `PENDING` to `CONFIRMED`. After verification the bot displays the user's opaque personal referral link; `/ref` displays it again for verified subscribers.
