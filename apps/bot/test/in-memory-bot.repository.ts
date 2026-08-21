import type {
  AuditEventType,
  FraudType,
  TelegramUpdateStatus,
} from "@telegram-referral/database";

import type {
  ActiveChallengeRecord,
  BotUserRecord,
  ChallengeDashboardRecord,
  MembershipVerificationResult,
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
  public readonly rewardInvites = new Map<string, string>();
  public activeChallenge: ActiveChallengeRecord | null = null;

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

  public async getChallengeDashboard(
    telegramId: bigint,
    now: Date,
    leaderboardLimit = 5,
  ): Promise<ChallengeDashboardRecord | null> {
    const user = await this.findUserByTelegramId(telegramId);
    if (!user) return null;
    const challenge = await this.findActiveChallenge(now);
    if (!challenge) {
      return {
        user,
        challenge: null,
        invitedCount: 0,
        pendingCount: 0,
        confirmedCount: 0,
        remainingCount: 0,
        rank: null,
        leaderboard: [],
        rewardInviteLink: null,
      };
    }
    const relevant = [...this.referrals.values()].filter(
      (referral) =>
        referral.referrerId === user.id &&
        referral.challengeId === challenge.id,
    );
    const pendingCount = relevant.filter(
      (referral) => referral.status === "PENDING",
    ).length;
    const confirmedCount = relevant.filter(
      (referral) => referral.status === "CONFIRMED",
    ).length;
    const counts = new Map<string, number>();
    for (const referral of this.referrals.values()) {
      if (
        referral.challengeId === challenge.id &&
        referral.status === "CONFIRMED"
      ) {
        counts.set(
          referral.referrerId,
          (counts.get(referral.referrerId) ?? 0) + 1,
        );
      }
    }
    const ranked = [...counts.entries()].sort(
      ([leftId, leftCount], [rightId, rightCount]) =>
        rightCount - leftCount || leftId.localeCompare(rightId),
    );
    return {
      user,
      challenge,
      invitedCount: pendingCount + confirmedCount,
      pendingCount,
      confirmedCount,
      remainingCount: Math.max(challenge.referralTarget - confirmedCount, 0),
      rank:
        ranked.findIndex(([candidateId]) => candidateId === user.id) + 1 ||
        null,
      leaderboard: ranked.slice(0, leaderboardLimit).flatMap(([id, count]) => {
        const rankedUser = this.users.get(id);
        return rankedUser
          ? [
              {
                telegramId: rankedUser.telegramId,
                username: rankedUser.username,
                firstName: rankedUser.firstName,
                confirmedCount: count,
              },
            ]
          : [];
      }),
      rewardInviteLink:
        this.rewardInvites.get(`${challenge.id}:${user.id}`) ?? null,
    };
  }

  public deliverRewardInvite(input: {
    challengeId: string;
    userId: string;
    inviteLink: string;
    deliveredAt: Date;
  }): Promise<string> {
    void input.deliveredAt;
    const key = `${input.challengeId}:${input.userId}`;
    const existing = this.rewardInvites.get(key);
    if (existing) return Promise.resolve(existing);
    const confirmedCount = [...this.referrals.values()].filter(
      (referral) =>
        referral.referrerId === input.userId &&
        referral.challengeId === input.challengeId &&
        referral.status === "CONFIRMED",
    ).length;
    if (
      !this.activeChallenge ||
      this.activeChallenge.id !== input.challengeId ||
      confirmedCount < this.activeChallenge.referralTarget
    ) {
      return Promise.reject(new Error("Reward is not eligible for delivery"));
    }
    this.rewardInvites.set(key, input.inviteLink);
    return Promise.resolve(input.inviteLink);
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
  }): Promise<MembershipVerificationResult> {
    void input.channelId;
    void input.telegramStatus;
    void input.telegramUpdateId;
    const user = this.users.get(input.userId);
    if (!user) {
      return Promise.resolve({ outcome: "USER_NOT_FOUND", confirmation: null });
    }

    user.isSubscribed = input.isSubscribed;
    user.subscriptionCheckedAt = input.checkedAt;
    if (!input.isSubscribed) {
      return Promise.resolve({ outcome: "NOT_SUBSCRIBED", confirmation: null });
    }
    if (user.isBlocked) {
      return Promise.resolve({ outcome: "BLOCKED", confirmation: null });
    }
    if (user.isSuspicious) {
      return Promise.resolve({ outcome: "SUSPICIOUS", confirmation: null });
    }
    if (!user.captchaVerified) {
      return Promise.resolve({ outcome: "CAPTCHA_REQUIRED", confirmation: null });
    }

    const referral = this.referrals.get(user.id);
    if (!referral) {
      return Promise.resolve({ outcome: "VERIFIED_NO_REFERRAL", confirmation: null });
    }
    if (referral.status === "CONFIRMED") {
      return Promise.resolve({ outcome: "ALREADY_CONFIRMED", confirmation: null });
    }
    if (
      !this.activeChallenge ||
      this.activeChallenge.id !== referral.challengeId ||
      this.activeChallenge.startDate > input.checkedAt ||
      this.activeChallenge.endDate <= input.checkedAt
    ) {
      return Promise.resolve({ outcome: "NO_ACTIVE_CHALLENGE", confirmation: null });
    }

    referral.status = "CONFIRMED";
    referral.confirmedAt = input.checkedAt;
    const confirmedCount = [...this.referrals.values()].filter(
      (candidate) =>
        candidate.referrerId === referral.referrerId &&
        candidate.challengeId === referral.challengeId &&
        candidate.status === "CONFIRMED",
    ).length;
    const referrer = this.users.get(referral.referrerId);
    if (!referrer || !this.activeChallenge) {
      return Promise.resolve({ outcome: "CONFIRMED", confirmation: null });
    }
    return Promise.resolve({
      outcome: "CONFIRMED",
      confirmation: {
        referrerTelegramId: referrer.telegramId,
        challengeId: referral.challengeId,
        confirmedCount,
        referralTarget: this.activeChallenge.referralTarget,
        remainingCount: Math.max(
          this.activeChallenge.referralTarget - confirmedCount,
          0,
        ),
        rewardUnlocked:
          confirmedCount >= this.activeChallenge.referralTarget,
      },
    });
  }

  public countFraudType(type: FraudType): number {
    return this.fraudFlags.filter((flag) => flag.type === type).length;
  }

  public countAuditType(type: AuditEventType): number {
    return this.audits.filter((audit) => audit.eventType === type).length;
  }
}
