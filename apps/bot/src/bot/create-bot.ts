import { Telegraf } from "telegraf";

import type { BotRepository } from "../repositories/bot-repository.js";
import type { CaptchaService } from "../services/captcha.service.js";
import type { MembershipService } from "../services/membership.service.js";
import type { OnboardingService } from "../services/onboarding.service.js";
import type { UpdateProcessorService } from "../services/update-processor.service.js";
import { captchaKeyboard, subscriptionKeyboard } from "../keyboards/onboarding.js";
import { uz } from "../locales/uz.js";
import { extractStartPayload } from "../utils/start-payload.js";

export interface BotDependencies {
  repository: BotRepository;
  onboardingService: OnboardingService;
  captchaService: CaptchaService;
  membershipService: MembershipService;
  updateProcessor: UpdateProcessorService;
  botUsername: string;
  mainChannelUsername: string;
  logger: {
    debug(bindings: object, message: string): void;
    error(bindings: object, message: string): void;
  };
  now?: () => Date;
}

export function createBot(token: string, dependencies: BotDependencies) {
  const bot = new Telegraf(token);
  const now = dependencies.now ?? (() => new Date());

  bot.start(async (context) => {
    const updateId = BigInt(context.update.update_id);
    try {
      await dependencies.updateProcessor.process(
        updateId,
        "message:start",
        async () => {
          const from = context.from;
          const result = await dependencies.onboardingService.start(
            {
              telegramId: BigInt(from.id),
              username: from.username ?? null,
              firstName: from.first_name,
              lastName: from.last_name ?? null,
              languageCode: from.language_code ?? null,
            },
            extractStartPayload(context.message.text),
            now(),
            updateId,
          );

          if (result.user.isBlocked) {
            await context.reply(uz.blocked);
            return;
          }

          if (result.captchaNonce) {
            await context.reply(
              uz.captchaPrompt,
              captchaKeyboard(result.captchaNonce),
            );
            return;
          }

          await context.reply(
            uz.subscriptionPrompt,
            subscriptionKeyboard(dependencies.mainChannelUsername),
          );
        },
      );
    } catch (error) {
      dependencies.logger.error(
        { error, updateId: updateId.toString() },
        "Failed to process /start",
      );
      await context.reply(uz.genericError);
    }
  });

  bot.action(/^captcha:([A-Za-z0-9_-]{20,40})$/, async (context) => {
    const updateId = BigInt(context.update.update_id);
    await context.answerCbQuery().catch((error: unknown) => {
      dependencies.logger.debug(
        { error, updateId: updateId.toString() },
        "Could not answer captcha callback query",
      );
    });

    try {
      await dependencies.updateProcessor.process(
        updateId,
        "callback_query:captcha",
        async () => {
          const user = await dependencies.repository.findUserByTelegramId(
            BigInt(context.from.id),
          );
          const nonce = context.match[1];
          if (!user || !nonce) {
            await context.editMessageText(uz.captchaInvalid);
            return;
          }

          const outcome = await dependencies.captchaService.verify(
            user.id,
            nonce,
            now(),
            updateId,
          );

          if (outcome === "VERIFIED") {
            await context.editMessageText(
              `${uz.captchaVerified}\n\n${uz.subscriptionPrompt}`,
              subscriptionKeyboard(dependencies.mainChannelUsername),
            );
            return;
          }

          if (outcome === "TOO_MANY_ATTEMPTS") {
            await context.editMessageText(uz.captchaTooManyAttempts);
            return;
          }

          if (outcome === "WRONG_USER" || outcome === "INVALID") {
            await context.editMessageText(uz.captchaInvalid);
            return;
          }

          await context.editMessageText(uz.captchaExpired);
        },
      );
    } catch (error) {
      dependencies.logger.error(
        { error, updateId: updateId.toString() },
        "Failed to process captcha callback",
      );
      await context.reply(uz.genericError);
    }
  });

  bot.action("verify_subscription", async (context) => {
    const updateId = BigInt(context.update.update_id);
    await context.answerCbQuery().catch((error: unknown) => {
      dependencies.logger.debug(
        { error, updateId: updateId.toString() },
        "Could not answer subscription callback query",
      );
    });

    try {
      await dependencies.updateProcessor.process(
        updateId,
        "callback_query:verify_subscription",
        async () => {
          const outcome = await dependencies.membershipService.verify(
            BigInt(context.from.id),
            now(),
            updateId,
          );

          if (outcome === "NOT_SUBSCRIBED") {
            await context.editMessageText(
              uz.subscriptionRequired,
              subscriptionKeyboard(dependencies.mainChannelUsername),
            );
            return;
          }
          if (outcome === "CAPTCHA_REQUIRED") {
            await context.editMessageText(uz.captchaRequired);
            return;
          }
          if (outcome === "BLOCKED") {
            await context.editMessageText(uz.blocked);
            return;
          }
          if (outcome === "SUSPICIOUS") {
            await context.editMessageText(uz.manualReview);
            return;
          }
          if (
            outcome === "NO_ACTIVE_CHALLENGE" ||
            outcome === "REFERRAL_NOT_ELIGIBLE"
          ) {
            await context.editMessageText(uz.referralNotEligible);
            return;
          }
          if (outcome === "USER_NOT_FOUND") {
            await context.editMessageText(uz.restartRequired);
            return;
          }

          const user = await dependencies.repository.findUserByTelegramId(
            BigInt(context.from.id),
          );
          if (!user) {
            await context.editMessageText(uz.restartRequired);
            return;
          }

          const confirmation =
            outcome === "CONFIRMED"
              ? uz.subscriptionConfirmedWithReferral
              : uz.subscriptionConfirmed;
          await context.editMessageText(
            `${confirmation}\n\n${uz.referralLink(
              dependencies.botUsername,
              user.referralCode,
            )}`,
          );
        },
      );
    } catch (error) {
      dependencies.logger.error(
        { error, updateId: updateId.toString() },
        "Failed to verify channel membership",
      );
      await context.reply(uz.genericError);
    }
  });

  bot.command("ref", async (context) => {
    const updateId = BigInt(context.update.update_id);
    try {
      await dependencies.updateProcessor.process(
        updateId,
        "message:ref",
        async () => {
          const user = await dependencies.repository.findUserByTelegramId(
            BigInt(context.from.id),
          );
          if (!user) {
            await context.reply(uz.restartRequired);
            return;
          }
          if (user.isBlocked) {
            await context.reply(uz.blocked);
            return;
          }
          if (!user.captchaVerified) {
            await context.reply(uz.captchaRequired);
            return;
          }
          if (!user.isSubscribed) {
            await context.reply(
              uz.subscriptionRequired,
              subscriptionKeyboard(dependencies.mainChannelUsername),
            );
            return;
          }

          await context.reply(
            uz.referralLink(dependencies.botUsername, user.referralCode),
          );
        },
      );
    } catch (error) {
      dependencies.logger.error(
        { error, updateId: updateId.toString() },
        "Failed to process /ref",
      );
      await context.reply(uz.genericError);
    }
  });

  bot.catch((error, context) => {
    dependencies.logger.error(
      { error, updateId: context.update.update_id },
      "Unhandled Telegram bot error",
    );
  });

  return bot;
}
