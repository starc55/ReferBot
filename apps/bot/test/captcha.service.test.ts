import { describe, expect, it } from "vitest";

import { CaptchaService } from "../src/services/captcha.service.js";
import { InMemoryBotRepository } from "./in-memory-bot.repository.js";
import { createTestTokens } from "./test-tokens.js";

const now = new Date("2026-09-05T07:00:00.000Z");

describe("CaptchaService", () => {
  it("verifies a matching unexpired nonce exactly once", async () => {
    const repository = new InMemoryBotRepository();
    const user = await repository.upsertTelegramUser(
      {
        telegramId: 100n,
        username: null,
        firstName: "Aziz",
        lastName: null,
        languageCode: "uz",
      },
      "azizcode1",
      now,
    );
    const service = new CaptchaService(
      repository,
      createTestTokens(),
      300,
      5,
    );
    const nonce = await service.createChallenge(user.id, now);

    await expect(service.verify(user.id, nonce, now, 1n)).resolves.toBe(
      "VERIFIED",
    );
    await expect(service.verify(user.id, nonce, now, 2n)).resolves.toBe(
      "ALREADY_USED",
    );
    await service.verify(user.id, nonce, now, 3n);
    await service.verify(user.id, nonce, now, 4n);
    await service.verify(user.id, nonce, now, 5n);
    await expect(service.verify(user.id, nonce, now, 6n)).resolves.toBe(
      "TOO_MANY_ATTEMPTS",
    );
    expect(repository.users.get(user.id)?.captchaVerified).toBe(true);
  });

  it("invalidates every other open captcha after verification", async () => {
    const repository = new InMemoryBotRepository();
    const user = await repository.upsertTelegramUser(
      {
        telegramId: 104n,
        username: null,
        firstName: "Concurrent",
        lastName: null,
        languageCode: "uz",
      },
      "concurrent1",
      now,
    );
    const tokens = createTestTokens();
    const service = new CaptchaService(repository, tokens, 300, 5);
    const nonce = await service.createChallenge(user.id, now);
    const secondNonce = "captcha_nonce_parallel";

    await repository.createCaptchaSession({
      id: tokens.entityId(),
      userId: user.id,
      nonceHash: tokens.hash(secondNonce),
      expiresAt: new Date(now.getTime() + 300_000),
      createdAt: now,
    });

    await expect(service.verify(user.id, nonce, now, 7n)).resolves.toBe(
      "VERIFIED",
    );
    await expect(service.verify(user.id, secondNonce, now, 8n)).resolves.toBe(
      "ALREADY_USED",
    );
  });

  it("rejects an expired nonce", async () => {
    const repository = new InMemoryBotRepository();
    const user = await repository.upsertTelegramUser(
      {
        telegramId: 101n,
        username: null,
        firstName: "Ali",
        lastName: null,
        languageCode: "uz",
      },
      "alicode01",
      now,
    );
    const service = new CaptchaService(
      repository,
      createTestTokens(),
      60,
      5,
    );
    const nonce = await service.createChallenge(user.id, now);

    await expect(
      service.verify(
        user.id,
        nonce,
        new Date(now.getTime() + 61_000),
        3n,
      ),
    ).resolves.toBe("EXPIRED");
  });

  it("rejects a nonce presented by another Telegram user", async () => {
    const repository = new InMemoryBotRepository();
    const owner = await repository.upsertTelegramUser(
      {
        telegramId: 102n,
        username: null,
        firstName: "Owner",
        lastName: null,
        languageCode: "uz",
      },
      "ownercode",
      now,
    );
    const attacker = await repository.upsertTelegramUser(
      {
        telegramId: 103n,
        username: null,
        firstName: "Attacker",
        lastName: null,
        languageCode: "uz",
      },
      "attackcode",
      now,
    );
    const service = new CaptchaService(
      repository,
      createTestTokens(),
      300,
      5,
    );
    const nonce = await service.createChallenge(owner.id, now);

    await expect(service.verify(attacker.id, nonce, now, 4n)).resolves.toBe(
      "WRONG_USER",
    );
  });
});
