import { FraudType } from "@telegram-referral/database";
import { beforeEach, describe, expect, it } from "vitest";

import type { BotUserRecord } from "../src/domain/types.js";
import { FraudService } from "../src/services/fraud.service.js";
import { ReferralService } from "../src/services/referral.service.js";
import { InMemoryBotRepository } from "./in-memory-bot.repository.js";
import { createTestTokens } from "./test-tokens.js";

const now = new Date("2026-09-05T07:00:00.000Z");

describe("ReferralService", () => {
  let repository: InMemoryBotRepository;
  let service: ReferralService;
  let referrer: BotUserRecord;
  let referredUser: BotUserRecord;

  beforeEach(async () => {
    repository = new InMemoryBotRepository();
    repository.activeChallenge = {
      id: "challenge-1",
      name: "Challenge",
      description: "Description",
      referralTarget: 5,
      startDate: new Date("2026-09-01T00:00:00.000Z"),
      endDate: new Date("2026-09-15T23:59:59.000Z"),
      rewardDescription: "Reward",
      rulesText: "Rules",
      rewardChannelId: null,
      rewardChannelUsername: null,
    };
    referrer = await repository.upsertTelegramUser(
      profile(100n, "Referrer"),
      "referrer01",
      now,
    );
    referredUser = await repository.upsertTelegramUser(
      profile(200n, "Referred"),
      "referred01",
      now,
    );
    service = new ReferralService(
      repository,
      new FraudService(),
      createTestTokens(),
    );
  });

  it("creates one pending referral during the active challenge", async () => {
    const outcome = await service.attributeReferral(
      referredUser,
      "ref_referrer01",
      now,
      1n,
    );

    expect(outcome).toBe("CREATED");
    expect(repository.referrals.get(referredUser.id)).toMatchObject({
      referrerId: referrer.id,
      challengeId: "challenge-1",
    });
  });

  it("does not duplicate the same referral", async () => {
    await service.attributeReferral(referredUser, "ref_referrer01", now, 1n);
    const outcome = await service.attributeReferral(
      referredUser,
      "ref_referrer01",
      now,
      2n,
    );

    expect(outcome).toBe("ALREADY_ATTRIBUTED");
    expect(repository.referrals.size).toBe(1);
  });

  it("rejects and flags self-referral", async () => {
    const outcome = await service.attributeReferral(
      referrer,
      "ref_referrer01",
      now,
      3n,
    );

    expect(outcome).toBe("SELF_REFERRAL");
    expect(repository.referrals.size).toBe(0);
    expect(repository.countFraudType(FraudType.SELF_REFERRAL)).toBe(1);
  });

  it("keeps the original referrer and flags a reassignment attempt", async () => {
    const otherReferrer = await repository.upsertTelegramUser(
      profile(300n, "Other"),
      "otherref01",
      now,
    );
    await service.attributeReferral(referredUser, "ref_referrer01", now, 4n);
    const outcome = await service.attributeReferral(
      referredUser,
      "ref_otherref01",
      now,
      5n,
    );

    expect(outcome).toBe("ALREADY_ATTRIBUTED");
    expect(repository.referrals.get(referredUser.id)?.referrerId).toBe(
      referrer.id,
    );
    expect(repository.referrals.get(referredUser.id)?.referrerId).not.toBe(
      otherReferrer.id,
    );
    expect(repository.countFraudType(FraudType.DUPLICATE_REFERRAL)).toBe(1);
  });

  it.each([
    ["not started", new Date("2026-08-31T23:59:59.000Z")],
    ["expired", new Date("2026-09-16T00:00:00.000Z")],
  ])("does not attribute when challenge is %s", async (_label, at) => {
    const outcome = await service.attributeReferral(
      referredUser,
      "ref_referrer01",
      at,
      6n,
    );

    expect(outcome).toBe("NO_ACTIVE_CHALLENGE");
    expect(repository.referrals.size).toBe(0);
  });
});

function profile(telegramId: bigint, firstName: string) {
  return {
    telegramId,
    username: null,
    firstName,
    lastName: null,
    languageCode: "uz",
  };
}
