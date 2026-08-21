import {
  AuditActorType,
  AuditEventType,
  ReferralStatus,
  RewardStatus,
  SubscriptionEventType,
  TelegramUpdateStatus,
  type Prisma,
  type PrismaClient,
} from "@telegram-referral/database";

import type {
  BotUserRecord,
  ChallengeDashboardRecord,
  MembershipVerificationResult,
} from "../domain/types.js";
import {
  ReferralCodeCollisionError,
  type AuditEventInput,
  type BotRepository,
  type BotTransaction,
  type CaptchaSessionRecord,
  type CreatePendingReferralInput,
  type FraudFlagInput,
} from "./bot-repository.js";

const userSelection = {
  id: true,
  telegramId: true,
  username: true,
  firstName: true,
  lastName: true,
  languageCode: true,
  referralCode: true,
  captchaVerified: true,
  isSubscribed: true,
  subscriptionCheckedAt: true,
  isBlocked: true,
  isSuspicious: true,
} satisfies Prisma.UserSelect;

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

class PrismaBotTransaction implements BotTransaction {
  public constructor(private readonly transaction: Prisma.TransactionClient) {}

  public findActiveChallenge(now: Date) {
    return this.transaction.challenge.findFirst({
      where: {
        isActive: true,
        startDate: { lte: now },
        endDate: { gt: now },
      },
      orderBy: [{ startDate: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        description: true,
        referralTarget: true,
        startDate: true,
        endDate: true,
        rewardDescription: true,
        rulesText: true,
        rewardChannelId: true,
        rewardChannelUsername: true,
      },
    });
  }

  public findUserByReferralCode(
    referralCode: string,
  ): Promise<BotUserRecord | null> {
    return this.transaction.user.findUnique({
      where: { referralCode },
      select: userSelection,
    });
  }

  public findReferralByReferredUserId(userId: string) {
    return this.transaction.referral.findUnique({
      where: { referredUserId: userId },
      select: {
        id: true,
        referrerId: true,
        referredUserId: true,
        challengeId: true,
      },
    });
  }

  public async createPendingReferralIfAbsent(
    input: CreatePendingReferralInput,
  ): Promise<boolean> {
    const result = await this.transaction.referral.createMany({
      data: [
        {
          id: input.id,
          referrerId: input.referrerId,
          referredUserId: input.referredUserId,
          challengeId: input.challengeId,
          status: ReferralStatus.PENDING,
          createdAt: input.createdAt,
        },
      ],
      skipDuplicates: true,
    });
    return result.count === 1;
  }

  public async createFraudFlag(input: FraudFlagInput): Promise<void> {
    await this.transaction.fraudFlag.create({
      data: {
        type: input.type,
        severity: input.severity,
        description: input.description,
        ...(input.userId ? { userId: input.userId } : {}),
        ...(input.referralId ? { referralId: input.referralId } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      },
      select: { id: true },
    });
  }

  public async recordAudit(input: AuditEventInput): Promise<void> {
    await this.transaction.auditLog.createMany({
      data: [
        {
          eventType: input.eventType,
          actorType: input.actorType,
          ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
          ...(input.subjectUserId
            ? { subjectUserId: input.subjectUserId }
            : {}),
          ...(input.telegramUpdateId !== undefined
            ? { telegramUpdateId: input.telegramUpdateId }
            : {}),
          ...(input.entityType ? { entityType: input.entityType } : {}),
          ...(input.entityId ? { entityId: input.entityId } : {}),
          ...(input.description ? { description: input.description } : {}),
          ...(input.metadata ? { metadata: input.metadata } : {}),
        },
      ],
      skipDuplicates: true,
    });
  }

  public async invalidateOpenCaptchaSessions(
    userId: string,
    now: Date,
  ): Promise<void> {
    await this.transaction.captchaSession.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now },
    });
  }

  public async createCaptchaSession(input: {
    id: string;
    userId: string;
    nonceHash: string;
    expiresAt: Date;
    createdAt: Date;
  }): Promise<void> {
    await this.transaction.captchaSession.create({
      data: input,
      select: { id: true },
    });
  }

  public findCaptchaSessionByHash(
    nonceHash: string,
  ): Promise<CaptchaSessionRecord | null> {
    return this.transaction.captchaSession.findUnique({
      where: { nonceHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
        attempts: true,
      },
    });
  }

  public async registerCaptchaAttempt(
    sessionId: string,
    maxAttempts: number,
  ): Promise<boolean> {
    const result = await this.transaction.captchaSession.updateMany({
      where: {
        id: sessionId,
        attempts: { lt: maxAttempts },
      },
      data: { attempts: { increment: 1 } },
    });
    return result.count === 1;
  }

  public async claimCaptchaSession(
    sessionId: string,
    now: Date,
  ): Promise<boolean> {
    const result = await this.transaction.captchaSession.updateMany({
      where: { id: sessionId, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    return result.count === 1;
  }

  public async markUserCaptchaVerified(
    userId: string,
    now: Date,
  ): Promise<void> {
    await this.transaction.user.update({
      where: { id: userId },
      data: { captchaVerified: true, lastActivityAt: now },
      select: { id: true },
    });
  }
}

export class PrismaBotRepository implements BotRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public findUserByTelegramId(
    telegramId: bigint,
  ): Promise<BotUserRecord | null> {
    return this.prisma.user.findUnique({
      where: { telegramId },
      select: userSelection,
    });
  }

  public async upsertTelegramUser(
    profile: Parameters<BotRepository["upsertTelegramUser"]>[0],
    referralCode: string,
    now: Date,
  ): Promise<BotUserRecord> {
    try {
      return await this.prisma.user.upsert({
        where: { telegramId: profile.telegramId },
        create: {
          telegramId: profile.telegramId,
          referralCode,
          username: profile.username,
          firstName: profile.firstName,
          lastName: profile.lastName,
          languageCode: profile.languageCode,
          lastActivityAt: now,
        },
        update: {
          username: profile.username,
          firstName: profile.firstName,
          lastName: profile.lastName,
          languageCode: profile.languageCode,
          lastActivityAt: now,
        },
        select: userSelection,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ReferralCodeCollisionError();
      }
      throw error;
    }
  }

  public runInTransaction<T>(
    operation: (transaction: BotTransaction) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction((transaction) =>
      operation(new PrismaBotTransaction(transaction)),
    );
  }

  public async claimTelegramUpdate(
    updateId: bigint,
    updateType: string,
  ): Promise<boolean> {
    const created = await this.prisma.telegramUpdate.createMany({
      data: [
        {
          updateId,
          updateType,
          status: TelegramUpdateStatus.PROCESSING,
          attempts: 1,
        },
      ],
      skipDuplicates: true,
    });
    if (created.count === 1) {
      return true;
    }

    const retried = await this.prisma.telegramUpdate.updateMany({
      where: { updateId, status: TelegramUpdateStatus.FAILED },
      data: {
        status: TelegramUpdateStatus.PROCESSING,
        attempts: { increment: 1 },
        processedAt: null,
        lastError: null,
      },
    });
    return retried.count === 1;
  }

  public async completeTelegramUpdate(
    updateId: bigint,
    processedAt: Date,
  ): Promise<void> {
    await this.prisma.telegramUpdate.updateMany({
      where: { updateId, status: TelegramUpdateStatus.PROCESSING },
      data: { status: TelegramUpdateStatus.PROCESSED, processedAt },
    });
  }

  public async failTelegramUpdate(
    updateId: bigint,
    processedAt: Date,
    errorMessage: string,
  ): Promise<void> {
    await this.prisma.telegramUpdate.updateMany({
      where: { updateId, status: TelegramUpdateStatus.PROCESSING },
      data: {
        status: TelegramUpdateStatus.FAILED,
        processedAt,
        lastError: errorMessage,
      },
    });
  }

  public async getChallengeDashboard(
    telegramId: bigint,
    now: Date,
    leaderboardLimit = 5,
  ): Promise<ChallengeDashboardRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { telegramId },
      select: userSelection,
    });
    if (!user) return null;

    const challenge = await this.prisma.challenge.findFirst({
      where: {
        isActive: true,
        startDate: { lte: now },
        endDate: { gt: now },
      },
      orderBy: [{ startDate: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        description: true,
        referralTarget: true,
        startDate: true,
        endDate: true,
        rewardDescription: true,
        rulesText: true,
        rewardChannelId: true,
        rewardChannelUsername: true,
      },
    });
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

    const [statusGroups, rankingGroups, reward] = await Promise.all([
      this.prisma.referral.groupBy({
        by: ["status"],
        where: {
          referrerId: user.id,
          challengeId: challenge.id,
          status: { in: [ReferralStatus.PENDING, ReferralStatus.CONFIRMED] },
        },
        _count: { _all: true },
      }),
      this.prisma.referral.groupBy({
        by: ["referrerId"],
        where: {
          challengeId: challenge.id,
          status: ReferralStatus.CONFIRMED,
        },
        _count: { _all: true },
      }),
      this.prisma.reward.findUnique({
        where: {
          challengeId_userId: { challengeId: challenge.id, userId: user.id },
        },
        select: { deliveryReference: true },
      }),
    ]);

    const pendingCount =
      statusGroups.find((group) => group.status === ReferralStatus.PENDING)
        ?._count._all ?? 0;
    const confirmedCount =
      statusGroups.find((group) => group.status === ReferralStatus.CONFIRMED)
        ?._count._all ?? 0;
    const ranked = rankingGroups.sort(
      (left, right) =>
        right._count._all - left._count._all ||
        left.referrerId.localeCompare(right.referrerId),
    );
    const topGroups = ranked.slice(0, leaderboardLimit);
    const topUsers = await this.prisma.user.findMany({
      where: { id: { in: topGroups.map((entry) => entry.referrerId) } },
      select: { id: true, telegramId: true, username: true, firstName: true },
    });
    const usersById = new Map(topUsers.map((entry) => [entry.id, entry]));
    const leaderboard = topGroups.flatMap((entry) => {
      const rankedUser = usersById.get(entry.referrerId);
      return rankedUser
        ? [
            {
              telegramId: rankedUser.telegramId,
              username: rankedUser.username,
              firstName: rankedUser.firstName,
              confirmedCount: entry._count._all,
            },
          ]
        : [];
    });
    const rankIndex = ranked.findIndex((entry) => entry.referrerId === user.id);

    return {
      user,
      challenge,
      invitedCount: pendingCount + confirmedCount,
      pendingCount,
      confirmedCount,
      remainingCount: Math.max(challenge.referralTarget - confirmedCount, 0),
      rank: rankIndex >= 0 ? rankIndex + 1 : null,
      leaderboard,
      rewardInviteLink: reward?.deliveryReference ?? null,
    };
  }

  public async deliverRewardInvite(input: {
    challengeId: string;
    userId: string;
    inviteLink: string;
    deliveredAt: Date;
  }): Promise<string> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.reward.updateMany({
        where: {
          challengeId: input.challengeId,
          userId: input.userId,
          deliveryReference: null,
          status: {
            in: [
              RewardStatus.ELIGIBLE,
              RewardStatus.PENDING,
              RewardStatus.APPROVED,
            ],
          },
        },
        data: {
          status: RewardStatus.DELIVERED,
          deliveredAt: input.deliveredAt,
          deliveryReference: input.inviteLink,
        },
      });
      const reward = await transaction.reward.findUnique({
        where: {
          challengeId_userId: {
            challengeId: input.challengeId,
            userId: input.userId,
          },
        },
        select: { deliveryReference: true },
      });
      if (!reward?.deliveryReference) {
        throw new Error("Reward is not eligible for delivery");
      }
      return reward.deliveryReference;
    });
  }

  public applyMembershipCheck(
    input: Parameters<BotRepository["applyMembershipCheck"]>[0],
  ): ReturnType<BotRepository["applyMembershipCheck"]> {
    return this.prisma.$transaction(
      async (transaction): Promise<MembershipVerificationResult> => {
        const result = (
          outcome: MembershipVerificationResult["outcome"],
          confirmation: MembershipVerificationResult["confirmation"] = null,
        ): MembershipVerificationResult => ({ outcome, confirmation });
        const user = await transaction.user.findUnique({
          where: { id: input.userId },
          select: {
            id: true,
            captchaVerified: true,
            isSubscribed: true,
            subscriptionCheckedAt: true,
            isBlocked: true,
            isSuspicious: true,
          },
        });
        if (!user) {
          return result("USER_NOT_FOUND");
        }

        await transaction.subscriptionEvent.createMany({
          data: [
            {
              userId: user.id,
              channelId: input.channelId,
              oldStatus: user.subscriptionCheckedAt
                ? user.isSubscribed
                  ? "member"
                  : "left"
                : null,
              newStatus: input.telegramStatus,
              eventType: user.subscriptionCheckedAt
                ? SubscriptionEventType.RECONCILIATION
                : SubscriptionEventType.INITIAL_CHECK,
              telegramUpdateId: input.telegramUpdateId,
              createdAt: input.checkedAt,
            },
          ],
          skipDuplicates: true,
        });

        await transaction.user.update({
          where: { id: user.id },
          data: {
            isSubscribed: input.isSubscribed,
            subscriptionCheckedAt: input.checkedAt,
            lastActivityAt: input.checkedAt,
          },
          select: { id: true },
        });

        if (!input.isSubscribed) {
          return result("NOT_SUBSCRIBED");
        }

        await transaction.auditLog.createMany({
          data: [
            {
              eventType: AuditEventType.CHANNEL_VERIFIED,
              actorType: AuditActorType.TELEGRAM_USER,
              actorUserId: user.id,
              subjectUserId: user.id,
              telegramUpdateId: input.telegramUpdateId,
              entityType: "User",
              entityId: user.id,
              metadata: {
                channelId: input.channelId.toString(),
                telegramStatus: input.telegramStatus,
              },
            },
          ],
          skipDuplicates: true,
        });

        if (user.isBlocked) {
          return result("BLOCKED");
        }
        if (user.isSuspicious) {
          return result("SUSPICIOUS");
        }
        if (!user.captchaVerified) {
          return result("CAPTCHA_REQUIRED");
        }

        const referral = await transaction.referral.findUnique({
          where: { referredUserId: user.id },
          select: {
            id: true,
            status: true,
            referrer: { select: { id: true, telegramId: true } },
            challenge: {
              select: {
                id: true,
                isActive: true,
                startDate: true,
                endDate: true,
                referralTarget: true,
              },
            },
          },
        });
        if (!referral) {
          return result("VERIFIED_NO_REFERRAL");
        }
        if (referral.status === ReferralStatus.CONFIRMED) {
          return result("ALREADY_CONFIRMED");
        }
        if (referral.status !== ReferralStatus.PENDING) {
          return result("REFERRAL_NOT_ELIGIBLE");
        }
        if (
          !referral.challenge.isActive ||
          referral.challenge.startDate > input.checkedAt ||
          referral.challenge.endDate <= input.checkedAt
        ) {
          return result("NO_ACTIVE_CHALLENGE");
        }

        const confirmed = await transaction.referral.updateMany({
          where: { id: referral.id, status: ReferralStatus.PENDING },
          data: {
            status: ReferralStatus.CONFIRMED,
            joinedChannelAt: input.checkedAt,
            confirmedAt: input.checkedAt,
            leftChannelAt: null,
            invalidatedAt: null,
          },
        });
        if (confirmed.count !== 1) {
          return result("ALREADY_CONFIRMED");
        }

        await transaction.auditLog.createMany({
          data: [
            {
              eventType: AuditEventType.REFERRAL_CONFIRMED,
              actorType: AuditActorType.SYSTEM,
              subjectUserId: user.id,
              telegramUpdateId: input.telegramUpdateId,
              entityType: "Referral",
              entityId: referral.id,
            },
          ],
          skipDuplicates: true,
        });
        const confirmedCount = await transaction.referral.count({
          where: {
            referrerId: referral.referrer.id,
            challengeId: referral.challenge.id,
            status: ReferralStatus.CONFIRMED,
          },
        });
        const rewardUnlocked =
          confirmedCount >= referral.challenge.referralTarget;
        if (rewardUnlocked) {
          const reward = await transaction.reward.createMany({
            data: [
              {
                challengeId: referral.challenge.id,
                userId: referral.referrer.id,
                status: RewardStatus.ELIGIBLE,
                qualifiedAt: input.checkedAt,
              },
            ],
            skipDuplicates: true,
          });
          if (reward.count === 1) {
            await transaction.auditLog.createMany({
              data: [
                {
                  eventType: AuditEventType.REWARD_ELIGIBLE,
                  actorType: AuditActorType.SYSTEM,
                  subjectUserId: referral.referrer.id,
                  telegramUpdateId: input.telegramUpdateId,
                  entityType: "Challenge",
                  entityId: referral.challenge.id,
                  metadata: { confirmedCount },
                },
              ],
              skipDuplicates: true,
            });
          }
        }

        return result("CONFIRMED", {
          referrerTelegramId: referral.referrer.telegramId,
          challengeId: referral.challenge.id,
          confirmedCount,
          referralTarget: referral.challenge.referralTarget,
          remainingCount: Math.max(
            referral.challenge.referralTarget - confirmedCount,
            0,
          ),
          rewardUnlocked,
        });
      },
      { isolationLevel: "Serializable" },
    );
  }
}
