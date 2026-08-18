import {
  AuditActorType,
  AuditEventType,
} from "@telegram-referral/database";

import type {
  BotUserRecord,
  ReferralAttributionOutcome,
} from "../domain/types.js";
import type { BotRepository } from "../repositories/bot-repository.js";
import type { TokenGenerator } from "../security/tokens.js";
import { parseReferralCode } from "../utils/start-payload.js";
import type { FraudService } from "./fraud.service.js";

export class ReferralService {
  public constructor(
    private readonly repository: BotRepository,
    private readonly fraudService: FraudService,
    private readonly tokens: TokenGenerator,
  ) {}

  public async attributeReferral(
    referredUser: BotUserRecord,
    payload: string | null,
    now: Date,
    telegramUpdateId: bigint,
  ): Promise<ReferralAttributionOutcome> {
    if (!payload) {
      return "NO_PAYLOAD";
    }

    const referralCode = parseReferralCode(payload);
    if (!referralCode) {
      return "INVALID_PAYLOAD";
    }

    return this.repository.runInTransaction(async (transaction) => {
      const challenge = await transaction.findActiveChallenge(now);
      if (!challenge) {
        return "NO_ACTIVE_CHALLENGE";
      }

      const referrer = await transaction.findUserByReferralCode(referralCode);
      if (!referrer) {
        return "REFERRER_NOT_FOUND";
      }

      if (referrer.isBlocked) {
        return "REFERRER_BLOCKED";
      }

      if (referrer.id === referredUser.id) {
        await this.fraudService.reportSelfReferral(
          transaction,
          referredUser.id,
          referralCode,
        );
        await transaction.recordAudit({
          eventType: AuditEventType.FRAUD_FLAG_CREATED,
          actorType: AuditActorType.TELEGRAM_USER,
          actorUserId: referredUser.id,
          subjectUserId: referredUser.id,
          telegramUpdateId,
          entityType: "User",
          entityId: referredUser.id,
          description: "Self-referral attempt rejected",
        });
        return "SELF_REFERRAL";
      }

      const existingReferral =
        await transaction.findReferralByReferredUserId(referredUser.id);
      if (existingReferral) {
        if (existingReferral.referrerId !== referrer.id) {
          await this.fraudService.reportDuplicateAttribution(
            transaction,
            referredUser.id,
            existingReferral.referrerId,
            referrer.id,
          );
        }
        return "ALREADY_ATTRIBUTED";
      }

      const referralId = this.tokens.entityId();
      const created = await transaction.createPendingReferralIfAbsent({
        id: referralId,
        referrerId: referrer.id,
        referredUserId: referredUser.id,
        challengeId: challenge.id,
        createdAt: now,
      });

      if (!created) {
        return "ALREADY_ATTRIBUTED";
      }

      await transaction.recordAudit({
        eventType: AuditEventType.REFERRAL_CREATED,
        actorType: AuditActorType.TELEGRAM_USER,
        actorUserId: referredUser.id,
        subjectUserId: referredUser.id,
        telegramUpdateId,
        entityType: "Referral",
        entityId: referralId,
        metadata: {
          challengeId: challenge.id,
          referrerId: referrer.id,
          status: "PENDING",
        },
      });

      return "CREATED";
    });
  }
}
