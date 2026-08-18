import {
  AuditActorType,
  AuditEventType,
  ReferralStatus,
  SubscriptionEventType,
  TelegramUpdateStatus,
  type Prisma,
  type PrismaClient,
} from "@telegram-referral/database";

import type { BotUserRecord } from "../domain/types.js";
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
      select: { id: true, startDate: true, endDate: true },
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

  public applyMembershipCheck(
    input: Parameters<BotRepository["applyMembershipCheck"]>[0],
  ): ReturnType<BotRepository["applyMembershipCheck"]> {
    return this.prisma.$transaction(
      async (transaction) => {
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
          return "USER_NOT_FOUND";
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
          return "NOT_SUBSCRIBED";
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
          return "BLOCKED";
        }
        if (user.isSuspicious) {
          return "SUSPICIOUS";
        }
        if (!user.captchaVerified) {
          return "CAPTCHA_REQUIRED";
        }

        const referral = await transaction.referral.findUnique({
          where: { referredUserId: user.id },
          select: {
            id: true,
            status: true,
            challenge: {
              select: {
                isActive: true,
                startDate: true,
                endDate: true,
              },
            },
          },
        });
        if (!referral) {
          return "VERIFIED_NO_REFERRAL";
        }
        if (referral.status === ReferralStatus.CONFIRMED) {
          return "ALREADY_CONFIRMED";
        }
        if (referral.status !== ReferralStatus.PENDING) {
          return "REFERRAL_NOT_ELIGIBLE";
        }
        if (
          !referral.challenge.isActive ||
          referral.challenge.startDate > input.checkedAt ||
          referral.challenge.endDate <= input.checkedAt
        ) {
          return "NO_ACTIVE_CHALLENGE";
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
          return "ALREADY_CONFIRMED";
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

        return "CONFIRMED";
      },
      { isolationLevel: "Serializable" },
    );
  }
}
