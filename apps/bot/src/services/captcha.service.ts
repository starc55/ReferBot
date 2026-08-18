import {
  AuditActorType,
  AuditEventType,
} from "@telegram-referral/database";

import type { CaptchaVerificationOutcome } from "../domain/types.js";
import type { BotRepository } from "../repositories/bot-repository.js";
import type { TokenGenerator } from "../security/tokens.js";

export class CaptchaService {
  public constructor(
    private readonly repository: BotRepository,
    private readonly tokens: TokenGenerator,
    private readonly ttlSeconds: number,
    private readonly maxAttempts: number,
  ) {}

  public async createChallenge(userId: string, now: Date): Promise<string> {
    const nonce = this.tokens.captchaNonce();
    const nonceHash = this.tokens.hash(nonce);
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1_000);

    await this.repository.runInTransaction(async (transaction) => {
      await transaction.invalidateOpenCaptchaSessions(userId, now);
      await transaction.createCaptchaSession({
        id: this.tokens.entityId(),
        userId,
        nonceHash,
        expiresAt,
        createdAt: now,
      });
    });

    return nonce;
  }

  public async verify(
    userId: string,
    nonce: string,
    now: Date,
    telegramUpdateId: bigint,
  ): Promise<CaptchaVerificationOutcome> {
    const nonceHash = this.tokens.hash(nonce);

    return this.repository.runInTransaction(async (transaction) => {
      const session = await transaction.findCaptchaSessionByHash(nonceHash);
      if (!session) {
        return "INVALID";
      }
      if (session.userId !== userId) {
        return "WRONG_USER";
      }
      const attemptAccepted = await transaction.registerCaptchaAttempt(
        session.id,
        this.maxAttempts,
      );
      if (!attemptAccepted) {
        return "TOO_MANY_ATTEMPTS";
      }
      if (session.usedAt) {
        return "ALREADY_USED";
      }
      if (session.expiresAt <= now) {
        return "EXPIRED";
      }
      const claimed = await transaction.claimCaptchaSession(session.id, now);
      if (!claimed) {
        return "ALREADY_USED";
      }

      await transaction.invalidateOpenCaptchaSessions(userId, now);
      await transaction.markUserCaptchaVerified(userId, now);
      await transaction.recordAudit({
        eventType: AuditEventType.CAPTCHA_VERIFIED,
        actorType: AuditActorType.TELEGRAM_USER,
        actorUserId: userId,
        subjectUserId: userId,
        telegramUpdateId,
        entityType: "CaptchaSession",
        entityId: session.id,
      });

      return "VERIFIED";
    });
  }
}
