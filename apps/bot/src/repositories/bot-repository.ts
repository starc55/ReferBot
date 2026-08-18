import type {
  AuditActorType,
  AuditEventType,
  FraudSeverity,
  FraudType,
} from "@telegram-referral/database";

import type { JsonObject } from "../domain/json.js";
import type {
  ActiveChallengeRecord,
  BotUserRecord,
  MembershipVerificationOutcome,
  ReferralRecord,
  TelegramUserProfile,
} from "../domain/types.js";

export class ReferralCodeCollisionError extends Error {
  public constructor() {
    super("Generated referral code collided with an existing code");
    this.name = "ReferralCodeCollisionError";
  }
}

export interface AuditEventInput {
  eventType: AuditEventType;
  actorType: AuditActorType;
  actorUserId?: string;
  subjectUserId?: string;
  telegramUpdateId?: bigint;
  entityType?: string;
  entityId?: string;
  description?: string;
  metadata?: JsonObject;
}

export interface FraudFlagInput {
  userId?: string;
  referralId?: string;
  type: FraudType;
  severity: FraudSeverity;
  description: string;
  metadata?: JsonObject;
}

export interface CreatePendingReferralInput {
  id: string;
  referrerId: string;
  referredUserId: string;
  challengeId: string;
  createdAt: Date;
}

export interface CaptchaSessionRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
  attempts: number;
}

export interface BotTransaction {
  findActiveChallenge(now: Date): Promise<ActiveChallengeRecord | null>;
  findUserByReferralCode(referralCode: string): Promise<BotUserRecord | null>;
  findReferralByReferredUserId(userId: string): Promise<ReferralRecord | null>;
  createPendingReferralIfAbsent(
    input: CreatePendingReferralInput,
  ): Promise<boolean>;
  createFraudFlag(input: FraudFlagInput): Promise<void>;
  recordAudit(input: AuditEventInput): Promise<void>;
  invalidateOpenCaptchaSessions(userId: string, now: Date): Promise<void>;
  createCaptchaSession(input: {
    id: string;
    userId: string;
    nonceHash: string;
    expiresAt: Date;
    createdAt: Date;
  }): Promise<void>;
  findCaptchaSessionByHash(
    nonceHash: string,
  ): Promise<CaptchaSessionRecord | null>;
  registerCaptchaAttempt(
    sessionId: string,
    maxAttempts: number,
  ): Promise<boolean>;
  claimCaptchaSession(
    sessionId: string,
    now: Date,
  ): Promise<boolean>;
  markUserCaptchaVerified(userId: string, now: Date): Promise<void>;
}

export interface BotRepository {
  findUserByTelegramId(telegramId: bigint): Promise<BotUserRecord | null>;
  upsertTelegramUser(
    profile: TelegramUserProfile,
    referralCode: string,
    now: Date,
  ): Promise<BotUserRecord>;
  runInTransaction<T>(
    operation: (transaction: BotTransaction) => Promise<T>,
  ): Promise<T>;
  claimTelegramUpdate(updateId: bigint, updateType: string): Promise<boolean>;
  completeTelegramUpdate(updateId: bigint, processedAt: Date): Promise<void>;
  failTelegramUpdate(
    updateId: bigint,
    processedAt: Date,
    errorMessage: string,
  ): Promise<void>;
  applyMembershipCheck(input: {
    userId: string;
    channelId: bigint;
    telegramStatus: string;
    isSubscribed: boolean;
    telegramUpdateId: bigint;
    checkedAt: Date;
  }): Promise<MembershipVerificationOutcome>;
}
