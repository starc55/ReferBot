import {
  AuditActorType,
  AuditEventType,
} from "@telegram-referral/database";

import type {
  StartOnboardingResult,
  TelegramUserProfile,
} from "../domain/types.js";
import {
  ReferralCodeCollisionError,
  type BotRepository,
} from "../repositories/bot-repository.js";
import type { TokenGenerator } from "../security/tokens.js";
import type { CaptchaService } from "./captcha.service.js";
import type { ReferralService } from "./referral.service.js";

const referralCodeGenerationAttempts = 5;

export class OnboardingService {
  public constructor(
    private readonly repository: BotRepository,
    private readonly referralService: ReferralService,
    private readonly captchaService: CaptchaService,
    private readonly tokens: TokenGenerator,
  ) {}

  public async start(
    profile: TelegramUserProfile,
    payload: string | null,
    now: Date,
    telegramUpdateId: bigint,
  ): Promise<StartOnboardingResult> {
    const user = await this.upsertUser(profile, now);

    await this.repository.runInTransaction((transaction) =>
      transaction.recordAudit({
        eventType: AuditEventType.USER_STARTED,
        actorType: AuditActorType.TELEGRAM_USER,
        actorUserId: user.id,
        subjectUserId: user.id,
        telegramUpdateId,
        entityType: "User",
        entityId: user.id,
        ...(payload ? { metadata: { startPayload: payload } } : {}),
      }),
    );

    if (user.isBlocked) {
      return { user, attribution: "NO_PAYLOAD", captchaNonce: null };
    }

    const attribution = await this.referralService.attributeReferral(
      user,
      payload,
      now,
      telegramUpdateId,
    );

    const captchaNonce = user.captchaVerified
      ? null
      : await this.captchaService.createChallenge(user.id, now);

    return { user, attribution, captchaNonce };
  }

  private async upsertUser(
    profile: TelegramUserProfile,
    now: Date,
  ): Promise<StartOnboardingResult["user"]> {
    for (let attempt = 0; attempt < referralCodeGenerationAttempts; attempt += 1) {
      try {
        return await this.repository.upsertTelegramUser(
          profile,
          this.tokens.referralCode(),
          now,
        );
      } catch (error) {
        if (!(error instanceof ReferralCodeCollisionError)) {
          throw error;
        }
      }
    }

    throw new Error("Could not generate a unique referral code");
  }
}
