# Architecture

## Runtime boundaries

- `apps/api` owns HTTP, the Telegram webhook, admin endpoints, and scheduled job entry points.
- `apps/bot` owns Telegraf handlers, keyboards, callback parsing, and localized messages.
- `apps/admin` is the browser-only Vite application and never receives server secrets.
- `packages/database` owns the generated Prisma client and PostgreSQL connection factory.
- `packages/shared` owns validated environment configuration and cross-application types.

The API and bot are separate packages but may be deployed in one persistent Node container. Business services are invoked by thin Express and Telegraf adapters. A reconciliation worker can later use the same services without importing HTTP or Telegram UI code.

## Trust boundaries

Telegram IDs identify bot users. Admins authenticate with Supabase Auth, but backend authorization also checks the approved email list or active `AdminProfile`. The browser cannot connect to application tables. All application data goes through authenticated `/admin/*` endpoints backed by Prisma.

The public-schema application tables have PostgreSQL row-level security enabled with no public policies. This is defense in depth against accidental Supabase Data API exposure; the dedicated Prisma database role is the server-side data path.

## Data invariants

- `users.telegram_id` and `users.referral_code` are unique.
- `referrals.referred_user_id` is globally unique, so attribution cannot be switched between campaigns or referrers.
- A database check prevents `referrer_id = referred_user_id`.
- `(rewards.challenge_id, rewards.user_id)` is unique.
- `telegram_updates.update_id` and `subscription_events.telegram_update_id` make Telegram retry handling idempotent.
- Captcha callbacks store only a SHA-256 nonce hash and are one-use with an expiry.
- Membership, fraud, and audit history are retained rather than overwritten or deleted.

## Time and counters

PostgreSQL stores `timestamptz` values in UTC. Business rules and presentation explicitly use `Asia/Tashkent`. Confirmed referral progress and rankings are derived from `Referral` rows; mutable counters are never authoritative.

## Phase 2 onboarding sequence

```text
Telegram update
  -> claim telegram_updates.update_id
  -> upsert users.telegram_id
  -> validate ref_<opaque-code>
  -> active challenge + immutable attribution checks
  -> create referrals row as PENDING only
  -> create expiring captcha session (hashed nonce)
  -> one-use callback verifies captcha transactionally
```

Every important action is written to `audit_logs`. The composite unique key on `(telegram_update_id, event_type)` prevents a retried Telegram update from duplicating the same audit event.
