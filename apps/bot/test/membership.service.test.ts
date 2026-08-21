import { describe, expect, it } from "vitest";

import type { TelegramMembership } from "../src/services/membership.service.js";
import { MembershipService } from "../src/services/membership.service.js";
import { InMemoryBotRepository } from "./in-memory-bot.repository.js";

const now = new Date("2026-09-05T07:00:00.000Z");
const channelId = -1002257806392n;

describe("MembershipService", () => {
  it.each(["creator", "administrator", "member"])(
    "treats %s as subscribed",
    async (status) => {
      const { repository, user } = await setup();
      const service = createService(repository, { status });

      await expect(service.verify(user.telegramId, now, 1n)).resolves.toMatchObject({
        outcome: "VERIFIED_NO_REFERRAL",
      });
      expect(repository.users.get(user.id)?.isSubscribed).toBe(true);
    },
  );

  it.each(["left", "kicked"])(
    "treats %s as not subscribed",
    async (status) => {
      const { repository, user } = await setup();
      const service = createService(repository, { status });

      await expect(service.verify(user.telegramId, now, 2n)).resolves.toMatchObject({
        outcome: "NOT_SUBSCRIBED",
      });
      expect(repository.users.get(user.id)?.isSubscribed).toBe(false);
    },
  );

  it("uses is_member for restricted members", async () => {
    const { repository, user } = await setup();
    const memberService = createService(repository, {
      status: "restricted",
      isMember: true,
    });

    await expect(
      memberService.verify(user.telegramId, now, 3n),
    ).resolves.toMatchObject({ outcome: "VERIFIED_NO_REFERRAL" });
  });

  it("confirms one pending referral after captcha and membership checks", async () => {
    const { repository, user } = await setup();
    const referrer = await repository.upsertTelegramUser(
      {
        telegramId: 100n,
        username: "referrer",
        firstName: "Referrer",
        lastName: null,
        languageCode: "uz",
      },
      "referrer01",
      now,
    );
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
    repository.users.get(user.id)!.captchaVerified = true;
    await repository.createPendingReferralIfAbsent({
      id: "referral-1",
      referrerId: referrer.id,
      referredUserId: user.id,
      challengeId: "challenge-1",
      createdAt: now,
    });
    const service = createService(repository, { status: "member" });

    await expect(service.verify(user.telegramId, now, 4n)).resolves.toMatchObject({
      outcome: "CONFIRMED",
      confirmation: { confirmedCount: 1, remainingCount: 4 },
    });
    await expect(service.verify(user.telegramId, now, 5n)).resolves.toMatchObject({
      outcome: "ALREADY_CONFIRMED",
    });
    expect(repository.referrals.get(user.id)?.status).toBe("CONFIRMED");
  });
});

async function setup() {
  const repository = new InMemoryBotRepository();
  const user = await repository.upsertTelegramUser(
    {
      telegramId: 200n,
      username: "participant",
      firstName: "Participant",
      lastName: null,
      languageCode: "uz",
    },
    "participant01",
    now,
  );
  repository.users.get(user.id)!.captchaVerified = true;
  return { repository, user };
}

function createService(
  repository: InMemoryBotRepository,
  membership: TelegramMembership,
) {
  return new MembershipService(
    repository,
    {
      getChatMember: () => Promise.resolve(membership),
    },
    channelId,
  );
}
