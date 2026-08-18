import type {
  AuditEventType,
  FraudType,
  TelegramUpdateStatus,
} from "@telegram-referral/database";

import type {
  BotUserRecord,
  MembershipVerificationOutcome,
  TelegramUserProfile,
} from "../src/domain/types.js";
import {
  ReferralCodeCollisionError,
  type AuditEventInput,
  type BotRepository,
  type BotTransaction,
  type CaptchaSessionRecord,
  type CreatePendingReferralInput,
  type FraudFlagInput,
} from "../src/repositories/bot-repository.js";

interface StoredUpdate {
  status: TelegramUpdateStatus;
  attempts: number;
}

interface StoredReferral extends CreatePendingReferralInput {
  status: "PENDING" | "CONFIRMED";
  confirmedAt?: Date;
}

export class InMemoryBotRepository
  implements BotRepository, BotTransaction
{
  public readonly users = new Map<string, BotUserRecord>();
  public readonly referrals = new Map<string, StoredReferral>();
  public readonly captchaSessions = new Map<
    string,
    CaptchaSessionRecord & { nonceHash: string }
  >();
  public readonly fraudFlags: FraudFlagInput[] = [];
  public readonly audits: AuditEventInput[] = [];
  public readonly updates = new Map<bigint, StoredUpdate>();
  public activeChallenge: {
    id: string;
    startDate: Date;
    endDate: Date;
  } | null = null;

  public findUserByTelegramId(
    telegramId: bigint,
  ): Promise<BotUserRecord | null> {
    return Promise.resolve(
      [...this.users.values()].find(
        (user) => user.telegramId === telegramId,
      ) ?? null,
    );
  }

  public async upsertTelegramUser(
    profile: TelegramUserProfile,
    referralCode: string,
    now: Date,
  ): Promise<BotUserRecord> {
    void now;
    const existing = await this.findUserByTelegramId(profile.telegramId);
    if (existing) {
      Object.assign(existing, profile);
      return existing;
    }
    if (
      [...this.users.values()].some(
        (user) => user.referralCode === referralCode,
      )
    ) {
      throw new ReferralCodeCollisionError();
    }

    const user: BotUserRecord = {
      id: `user-${profile.telegramId.toString()}`,
      ...profile,
      referralCode,
      captchaVerified: false,
      isSubscribed: false,
      subscriptionCheckedAt: null,
      isBlocked: false,
      isSuspicious: false,
    };
    this.users.set(user.id, user);
    return user;
  }

  public runInTransaction<T>(
    operation: (transaction: BotTransaction) => Promise<T>,
  ): Promise<T> {
    return operation(this);
  }

  public claimTelegramUpdate(
    updateId: bigint,
    updateType: string,
  ): Promise<boolean> {
    void updateType;
    const update = this.updates.get(updateId);
    if (!update) {
      this.updates.set(updateId, { status: "PROCESSING", attempts: 1 });
      return Promise.resolve(true);
    }
    if (update.status === "FAILED") {
      update.status = "PROCESSING";
      update.attempts += 1;
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }

  public completeTelegramUpdate(
    updateId: bigint,
    processedAt: Date,
  ): Promise<void> {
    void processedAt;
    const update = this.updates.get(updateId);
    if (update) update.status = "PROCESSED";
    return Promise.resolve();
  }

  public failTelegramUpdate(
    updateId: bigint,
    processedAt: Date,
    errorMessage: string,
  ): Promise<void> {
    void processedAt;
    void errorMessage;
    const update = this.updates.get(updateId);
    if (update) update.status = "FAILED";
    return Promise.resolve();
  }

  public findActiveChallenge(now: Date) {
    const challenge = this.activeChallenge;
    return Promise.resolve(
      challenge && challenge.startDate <= now && challenge.endDate > now
        ? challenge
        : null,
    );
  }

  public findUserByReferralCode(
    referralCode: string,
  ): Promise<BotUserRecord | null> {
    return Promise.resolve(
      [...this.users.values()].find(
        (user) => user.referralCode === referralCode,
      ) ?? null,
    );
  }

  public findReferralByReferredUserId(userId: string) {
    const referral = this.referrals.get(userId);
    return Promise.resolve(
      referral
        ? {
            id: referral.id,
            referrerId: referral.referrerId,
            referredUserId: referral.referredUserId,
            challengeId: referral.challengeId,
          }
        : null,
    );
  }

  public createPendingReferralIfAbsent(
    input: CreatePendingReferralInput,
  ): Promise<boolean> {
    if (this.referrals.has(input.referredUserId)) {
      return Promise.resolve(false);
    }
    this.referrals.set(input.referredUserId, {
      ...input,
      status: "PENDING",
    });
    return Promise.resolve(true);
  }

  public createFraudFlag(input: FraudFlagInput): Promise<void> {
    this.fraudFlags.push(input);
    return Promise.resolve();
  }

  public recordAudit(input: AuditEventInput): Promise<void> {
    const duplicate = this.audits.some(
      (audit) =>
        audit.telegramUpdateId !== undefined &&
        audit.telegramUpdateId === input.telegramUpdateId &&
        audit.eventType === input.eventType,
    );
    if (!duplicate) this.audits.push(input);
    return Promise.resolve();
  }

  public invalidateOpenCaptchaSessions(
    userId: string,
    now: Date,
  ): Promise<void> {
    for (const session of this.captchaSessions.values()) {
      if (session.userId === userId && !session.usedAt) session.usedAt = now;
    }
    return Promise.resolve();
  }

  public createCaptchaSession(input: {
    id: string;
    userId: string;
    nonceHash: string;
    expiresAt: Date;
    createdAt: Date;
  }): Promise<void> {
    this.captchaSessions.set(input.nonceHash, {
      id: input.id,
      userId: input.userId,
      expiresAt: input.expiresAt,
      usedAt: null,
      attempts: 0,
      nonceHash: input.nonceHash,
    });
    return Promise.resolve();
  }

  public findCaptchaSessionByHash(
    nonceHash: string,
  ): Promise<CaptchaSessionRecord | null> {
    return Promise.resolve(this.captchaSessions.get(nonceHash) ?? null);
  }

  public registerCaptchaAttempt(
    sessionId: string,
    maxAttempts: number,
  ): Promise<boolean> {
    const session = [...this.captchaSessions.values()].find(
      (candidate) => candidate.id === sessionId,
    );
    if (!session || session.attempts >= maxAttempts) {
      return Promise.resolve(false);
    }
    session.attempts += 1;
    return Promise.resolve(true);
  }

  public claimCaptchaSession(
    sessionId: string,
    now: Date,
  ): Promise<boolean> {
    const session = [...this.captchaSessions.values()].find(
      (candidate) => candidate.id === sessionId,
    );
    if (!session || session.usedAt || session.expiresAt <= now) {
      return Promise.resolve(false);
    }
    session.usedAt = now;
    return Promise.resolve(true);
  }

  public markUserCaptchaVerified(
    userId: string,
    now: Date,
  ): Promise<void> {
    void now;
    const user = this.users.get(userId);
    if (user) user.captchaVerified = true;
    return Promise.resolve();
  }

  public applyMembershipCheck(input: {
    userId: string;
    channelId: bigint;
    telegramStatus: string;
    isSubscribed: boolean;
    telegramUpdateId: bigint;
    checkedAt: Date;
  }): Promise<MembershipVerificationOutcome> {
    void input.channelId;
    void input.telegramStatus;
    void input.telegramUpdateId;
    const user = this.users.get(input.userId);
    if (!user) {
      return Promise.resolve("USER_NOT_FOUND");
    }

    user.isSubscribed = input.isSubscribed;
    user.subscriptionCheckedAt = input.checkedAt;
    if (!input.isSubscribed) {
      return Promise.resolve("NOT_SUBSCRIBED");
    }
    if (user.isBlocked) {
      return Promise.resolve("BLOCKED");
    }
    if (user.isSuspicious) {
      return Promise.resolve("SUSPICIOUS");
    }
    if (!user.captchaVerified) {
      return Promise.resolve("CAPTCHA_REQUIRED");
    }

    const referral = this.referrals.get(user.id);
    if (!referral) {
      return Promise.resolve("VERIFIED_NO_REFERRAL");
    }
    if (referral.status === "CONFIRMED") {
      return Promise.resolve("ALREADY_CONFIRMED");
    }
    if (
      !this.activeChallenge ||
      this.activeChallenge.id !== referral.challengeId ||
      this.activeChallenge.startDate > input.checkedAt ||
      this.activeChallenge.endDate <= input.checkedAt
    ) {
      return Promise.resolve("NO_ACTIVE_CHALLENGE");
    }

    referral.status = "CONFIRMED";
    referral.confirmedAt = input.checkedAt;
    return Promise.resolve("CONFIRMED");
  }

  public countFraudType(type: FraudType): number {
    return this.fraudFlags.filter((flag) => flag.type === type).length;
  }

  public countAuditType(type: AuditEventType): number {
    return this.audits.filter((audit) => audit.eventType === type).length;
  }
}
