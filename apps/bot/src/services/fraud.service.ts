import {
  FraudSeverity,
  FraudType,
} from "@telegram-referral/database";

import type { BotTransaction } from "../repositories/bot-repository.js";

export class FraudService {
  public async reportSelfReferral(
    transaction: BotTransaction,
    userId: string,
    referralCode: string,
  ): Promise<void> {
    await transaction.createFraudFlag({
      userId,
      type: FraudType.SELF_REFERRAL,
      severity: FraudSeverity.HIGH,
      description: "Telegram user attempted to use their own referral code",
      metadata: { referralCode },
    });
  }

  public async reportDuplicateAttribution(
    transaction: BotTransaction,
    userId: string,
    existingReferrerId: string,
    attemptedReferrerId: string,
  ): Promise<void> {
    await transaction.createFraudFlag({
      userId,
      type: FraudType.DUPLICATE_REFERRAL,
      severity: FraudSeverity.MEDIUM,
      description: "Referred user already belongs to a different referrer",
      metadata: { existingReferrerId, attemptedReferrerId },
    });
  }
}
