import { describe, expect, it } from "vitest";

import type { ChallengeDashboardRecord } from "../src/domain/types.js";
import { shareUrl } from "../src/keyboards/onboarding.js";
import { uz } from "../src/locales/uz.js";

const dashboard: ChallengeDashboardRecord = {
  user: {
    id: "user-1",
    telegramId: 100n,
    username: "tester",
    firstName: "Tester",
    lastName: null,
    languageCode: "uz",
    referralCode: "abc12345",
    captchaVerified: true,
    isSubscribed: true,
    subscriptionCheckedAt: new Date("2026-08-21T00:00:00.000Z"),
    isBlocked: false,
    isSuspicious: false,
  },
  challenge: {
    id: "challenge-1",
    name: "30 DAYS TO YOUR US🇺🇸DREAM",
    description: "Description",
    referralTarget: 5,
    startDate: new Date("2026-08-17T00:00:00.000Z"),
    endDate: new Date("2026-09-16T00:00:00.000Z"),
    rewardDescription: "Challenge access",
    rulesText: "Rules",
    rewardChannelId: -100123n,
    rewardChannelUsername: null,
  },
  invitedCount: 7,
  pendingCount: 2,
  confirmedCount: 5,
  remainingCount: 0,
  rank: 12,
  leaderboard: [
    {
      telegramId: 100n,
      username: "tester",
      firstName: "Tester",
      confirmedCount: 5,
    },
  ],
  rewardInviteLink: null,
};

describe("challenge bot copy", () => {
  it("renders stats, rank, access and referral link", () => {
    const message = uz.stats(dashboard, "referusebot");

    expect(message).toContain("Taklif qilingan: 7");
    expect(message).toContain("Tasdiqlangan: 5");
    expect(message).toContain("#12");
    expect(message).toContain("Challenge’ga kirish huquqi: ✅ BOR");
    expect(message).toContain("https://t.me/referusebot?start=ref_abc12345");
  });

  it("builds a Telegram share URL with the marketing copy", () => {
    const url = new URL(shareUrl("referusebot", "abc12345"));

    expect(url.origin).toBe("https://t.me");
    expect(url.pathname).toBe("/share/url");
    expect(url.searchParams.get("url")).toBe(
      "https://t.me/referusebot?start=ref_abc12345",
    );
    expect(url.searchParams.get("text")).toContain("30 DAYS TO YOUR US");
  });

  it("shows the fifth-referral unlock message", () => {
    expect(uz.challengeUnlocked(5)).toContain("TABRIKLAYMIZ! 5/5");
    expect(uz.challengeUnlocked(5)).toContain("30 DAYS TO YOUR US");
  });
});
