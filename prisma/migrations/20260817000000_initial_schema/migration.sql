-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'CONFIRMED', 'INVALIDATED', 'REJECTED', 'FRAUD');

-- CreateEnum
CREATE TYPE "RewardStatus" AS ENUM ('ELIGIBLE', 'PENDING', 'APPROVED', 'DELIVERED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FraudType" AS ENUM ('HIGH_REFERRAL_VELOCITY', 'SELF_REFERRAL', 'DUPLICATE_REFERRAL', 'SUBSCRIBE_UNSUBSCRIBE_ABUSE', 'REJOIN_ABUSE', 'SUSPICIOUS_ACTIVITY', 'MANUAL');

-- CreateEnum
CREATE TYPE "FraudSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "SubscriptionEventType" AS ENUM ('INITIAL_CHECK', 'JOINED', 'LEFT', 'KICKED', 'RESTRICTED', 'REJOINED', 'RECONCILIATION');

-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('USER_STARTED', 'CAPTCHA_VERIFIED', 'CHANNEL_VERIFIED', 'REFERRAL_CREATED', 'REFERRAL_CONFIRMED', 'REFERRAL_INVALIDATED', 'REFERRAL_RESTORED', 'REWARD_ELIGIBLE', 'REWARD_APPROVED', 'REWARD_REJECTED', 'REWARD_DELIVERED', 'FRAUD_FLAG_CREATED', 'FRAUD_FLAG_RESOLVED', 'ADMIN_BLOCKED_USER', 'ADMIN_UNBLOCKED_USER', 'ADMIN_MARKED_SUSPICIOUS', 'ADMIN_CLEARED_SUSPICIOUS', 'ADMIN_RECHECKED_MEMBERSHIP', 'CHALLENGE_CREATED', 'CHALLENGE_UPDATED', 'CHALLENGE_ACTIVATED', 'CHALLENGE_DEACTIVATED', 'SETTING_UPDATED', 'TELEGRAM_UPDATE_FAILED');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('SYSTEM', 'TELEGRAM_USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "TelegramUpdateStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'OWNER');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "telegram_id" BIGINT NOT NULL,
    "referral_code" VARCHAR(32) NOT NULL,
    "username" VARCHAR(32),
    "first_name" VARCHAR(128) NOT NULL,
    "last_name" VARCHAR(128),
    "language_code" VARCHAR(16),
    "captcha_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_subscribed" BOOLEAN NOT NULL DEFAULT false,
    "subscription_checked_at" TIMESTAMPTZ(3),
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "is_suspicious" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "last_activity_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenges" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT NOT NULL,
    "referral_target" INTEGER NOT NULL,
    "start_date" TIMESTAMPTZ(3) NOT NULL,
    "end_date" TIMESTAMPTZ(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "reward_description" TEXT NOT NULL,
    "rules_text" TEXT NOT NULL,
    "subscription_channel_id" BIGINT NOT NULL,
    "subscription_channel_username" VARCHAR(64),
    "reward_channel_id" BIGINT,
    "reward_channel_username" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" UUID NOT NULL,
    "referrer_id" UUID NOT NULL,
    "referred_user_id" UUID NOT NULL,
    "challenge_id" UUID NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "joined_channel_at" TIMESTAMPTZ(3),
    "left_channel_at" TIMESTAMPTZ(3),
    "confirmed_at" TIMESTAMPTZ(3),
    "invalidated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewards" (
    "id" UUID NOT NULL,
    "challenge_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "RewardStatus" NOT NULL DEFAULT 'ELIGIBLE',
    "qualified_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "admin_note" TEXT,
    "delivery_reference" VARCHAR(255),
    "reviewed_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fraud_flags" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "referral_id" UUID,
    "type" "FraudType" NOT NULL,
    "severity" "FraudSeverity" NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fraud_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_events" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "channel_id" BIGINT NOT NULL,
    "old_status" VARCHAR(32),
    "new_status" VARCHAR(32) NOT NULL,
    "event_type" "SubscriptionEventType" NOT NULL,
    "telegram_update_id" BIGINT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "captcha_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "nonce_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "captcha_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_updates" (
    "update_id" BIGINT NOT NULL,
    "update_type" VARCHAR(64) NOT NULL,
    "status" "TelegramUpdateStatus" NOT NULL DEFAULT 'RECEIVED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),
    "last_error" TEXT,

    CONSTRAINT "telegram_updates_pkey" PRIMARY KEY ("update_id")
);

-- CreateTable
CREATE TABLE "admin_profiles" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'ADMIN',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "admin_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "event_type" "AuditEventType" NOT NULL,
    "actor_type" "AuditActorType" NOT NULL,
    "actor_user_id" UUID,
    "actor_admin_id" UUID,
    "subject_user_id" UUID,
    "telegram_update_id" BIGINT,
    "entity_type" VARCHAR(64),
    "entity_id" VARCHAR(128),
    "description" TEXT,
    "metadata" JSONB,
    "ip_address" INET,
    "user_agent" VARCHAR(512),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" VARCHAR(128) NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_id_key" ON "users"("telegram_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_referral_code_key" ON "users"("referral_code");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE INDEX "users_is_suspicious_idx" ON "users"("is_suspicious");

-- CreateIndex
CREATE INDEX "users_is_subscribed_idx" ON "users"("is_subscribed");

-- CreateIndex
CREATE INDEX "users_is_blocked_idx" ON "users"("is_blocked");

-- CreateIndex
CREATE INDEX "challenges_is_active_start_date_end_date_idx" ON "challenges"("is_active", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "challenges_created_at_idx" ON "challenges"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referred_user_id_key" ON "referrals"("referred_user_id");

-- CreateIndex
CREATE INDEX "referrals_referrer_id_idx" ON "referrals"("referrer_id");

-- CreateIndex
CREATE INDEX "referrals_status_idx" ON "referrals"("status");

-- CreateIndex
CREATE INDEX "referrals_challenge_id_idx" ON "referrals"("challenge_id");

-- CreateIndex
CREATE INDEX "referrals_created_at_idx" ON "referrals"("created_at");

-- CreateIndex
CREATE INDEX "referrals_referrer_id_challenge_id_status_idx" ON "referrals"("referrer_id", "challenge_id", "status");

-- CreateIndex
CREATE INDEX "referrals_challenge_id_status_referrer_id_confirmed_at_idx" ON "referrals"("challenge_id", "status", "referrer_id", "confirmed_at");

-- CreateIndex
CREATE INDEX "rewards_user_id_idx" ON "rewards"("user_id");

-- CreateIndex
CREATE INDEX "rewards_challenge_id_idx" ON "rewards"("challenge_id");

-- CreateIndex
CREATE INDEX "rewards_status_idx" ON "rewards"("status");

-- CreateIndex
CREATE INDEX "rewards_qualified_at_idx" ON "rewards"("qualified_at");

-- CreateIndex
CREATE UNIQUE INDEX "rewards_challenge_id_user_id_key" ON "rewards"("challenge_id", "user_id");

-- CreateIndex
CREATE INDEX "fraud_flags_user_id_idx" ON "fraud_flags"("user_id");

-- CreateIndex
CREATE INDEX "fraud_flags_referral_id_idx" ON "fraud_flags"("referral_id");

-- CreateIndex
CREATE INDEX "fraud_flags_resolved_idx" ON "fraud_flags"("resolved");

-- CreateIndex
CREATE INDEX "fraud_flags_created_at_idx" ON "fraud_flags"("created_at");

-- CreateIndex
CREATE INDEX "fraud_flags_severity_resolved_created_at_idx" ON "fraud_flags"("severity", "resolved", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_events_telegram_update_id_key" ON "subscription_events"("telegram_update_id");

-- CreateIndex
CREATE INDEX "subscription_events_user_id_idx" ON "subscription_events"("user_id");

-- CreateIndex
CREATE INDEX "subscription_events_created_at_idx" ON "subscription_events"("created_at");

-- CreateIndex
CREATE INDEX "subscription_events_user_id_created_at_idx" ON "subscription_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "subscription_events_channel_id_created_at_idx" ON "subscription_events"("channel_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "captcha_sessions_nonce_hash_key" ON "captcha_sessions"("nonce_hash");

-- CreateIndex
CREATE INDEX "captcha_sessions_user_id_expires_at_idx" ON "captcha_sessions"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "captcha_sessions_expires_at_idx" ON "captcha_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "telegram_updates_status_received_at_idx" ON "telegram_updates"("status", "received_at");

-- CreateIndex
CREATE INDEX "telegram_updates_received_at_idx" ON "telegram_updates"("received_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_profiles_email_key" ON "admin_profiles"("email");

-- CreateIndex
CREATE INDEX "admin_profiles_is_active_idx" ON "admin_profiles"("is_active");

-- CreateIndex
CREATE INDEX "audit_logs_event_type_created_at_idx" ON "audit_logs"("event_type", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_admin_id_idx" ON "audit_logs"("actor_admin_id");

-- CreateIndex
CREATE INDEX "audit_logs_subject_user_id_idx" ON "audit_logs"("subject_user_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_user_id_fkey" FOREIGN KEY ("referred_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "admin_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_flags" ADD CONSTRAINT "fraud_flags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_flags" ADD CONSTRAINT "fraud_flags_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "referrals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_flags" ADD CONSTRAINT "fraud_flags_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "admin_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_telegram_update_id_fkey" FOREIGN KEY ("telegram_update_id") REFERENCES "telegram_updates"("update_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "captcha_sessions" ADD CONSTRAINT "captcha_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_admin_id_fkey" FOREIGN KEY ("actor_admin_id") REFERENCES "admin_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_subject_user_id_fkey" FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_telegram_update_id_fkey" FOREIGN KEY ("telegram_update_id") REFERENCES "telegram_updates"("update_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admin_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add database-level business invariants not expressible in Prisma Schema.
ALTER TABLE "challenges"
  ADD CONSTRAINT "challenges_referral_target_positive_check"
    CHECK ("referral_target" > 0),
  ADD CONSTRAINT "challenges_date_window_check"
    CHECK ("start_date" < "end_date");

ALTER TABLE "referrals"
  ADD CONSTRAINT "referrals_no_self_referral_check"
    CHECK ("referrer_id" <> "referred_user_id"),
  ADD CONSTRAINT "referrals_confirmed_timestamp_check"
    CHECK ("status" <> 'CONFIRMED' OR "confirmed_at" IS NOT NULL),
  ADD CONSTRAINT "referrals_invalidated_timestamp_check"
    CHECK ("status" <> 'INVALIDATED' OR "invalidated_at" IS NOT NULL);

ALTER TABLE "captcha_sessions"
  ADD CONSTRAINT "captcha_sessions_attempts_nonnegative_check"
    CHECK ("attempts" >= 0);

ALTER TABLE "telegram_updates"
  ADD CONSTRAINT "telegram_updates_attempts_nonnegative_check"
    CHECK ("attempts" >= 0);

ALTER TABLE "fraud_flags"
  ADD CONSTRAINT "fraud_flags_subject_check"
    CHECK ("user_id" IS NOT NULL OR "referral_id" IS NOT NULL),
  ADD CONSTRAINT "fraud_flags_resolution_timestamp_check"
    CHECK (NOT "resolved" OR "resolved_at" IS NOT NULL);

ALTER TABLE "rewards"
  ADD CONSTRAINT "rewards_approval_timestamp_check"
    CHECK ("status" NOT IN ('APPROVED', 'DELIVERED') OR "approved_at" IS NOT NULL),
  ADD CONSTRAINT "rewards_delivery_timestamp_check"
    CHECK ("status" <> 'DELIVERED' OR "delivered_at" IS NOT NULL);

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_actor_check"
    CHECK (
      ("actor_type" = 'SYSTEM' AND "actor_user_id" IS NULL AND "actor_admin_id" IS NULL)
      OR ("actor_type" = 'TELEGRAM_USER' AND "actor_user_id" IS NOT NULL AND "actor_admin_id" IS NULL)
      OR ("actor_type" = 'ADMIN' AND "actor_user_id" IS NULL AND "actor_admin_id" IS NOT NULL)
    );

-- Supabase exposes the public schema through its Data API. RLS with no public
-- policies keeps these server-owned tables inaccessible to anon/authenticated roles.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "challenges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "referrals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rewards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fraud_flags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscription_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "captcha_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "telegram_updates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admin_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "system_settings" ENABLE ROW LEVEL SECURITY;

