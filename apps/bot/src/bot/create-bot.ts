import { Telegraf } from "telegraf";
import type { Context } from "telegraf";

import type { ChallengeDashboardRecord } from "../domain/types.js";
import {
  captchaKeyboard,
  dashboardKeyboard,
  inviteAgainKeyboard,
  inviteLinkKeyboard,
  referralKeyboard,
  startKeyboard,
  statsKeyboard,
  subscriptionKeyboard,
  topKeyboard,
  unlockedKeyboard,
} from "../keyboards/onboarding.js";
import { uz } from "../locales/uz.js";
import type { BotRepository } from "../repositories/bot-repository.js";
import type { CaptchaService } from "../services/captcha.service.js";
import type { MembershipService } from "../services/membership.service.js";
import type { OnboardingService } from "../services/onboarding.service.js";
import type { UpdateProcessorService } from "../services/update-processor.service.js";
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

type InlineKeyboard = ReturnType<typeof startKeyboard>;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createBot(token: string, dependencies: BotDependencies) {
  const bot = new Telegraf(token);
  const now = dependencies.now ?? (() => new Date());

  async function sendText(
    context: Context,
    text: string,
    keyboard?: InlineKeyboard,
    edit = false,
  ): Promise<void> {
    if (!edit) {
      if (keyboard) await context.reply(text, keyboard);
      else await context.reply(text);
      return;
    }

    try {
      if (keyboard) await context.editMessageText(text, keyboard);
      else await context.editMessageText(text);
    } catch (error) {
      if (errorText(error).includes("message is not modified")) return;
      if (keyboard) await context.reply(text, keyboard);
      else await context.reply(text);
    }
  }

  async function dashboardFor(
    context: Context,
    telegramId: bigint,
    edit: boolean,
  ): Promise<ChallengeDashboardRecord | null> {
    const dashboard = await dependencies.repository.getChallengeDashboard(
      telegramId,
      now(),
    );
    if (!dashboard) {
      await sendText(context, uz.restartRequired, undefined, edit);
      return null;
    }
    if (dashboard.user.isBlocked) {
      await sendText(context, uz.blocked, undefined, edit);
      return null;
    }
    if (!dashboard.user.captchaVerified) {
      const nonce = await dependencies.captchaService.createChallenge(
        dashboard.user.id,
        now(),
      );
      await sendText(
        context,
        uz.captchaRequired,
        captchaKeyboard(nonce),
        edit,
      );
      return null;
    }
    if (!dashboard.user.isSubscribed) {
      await sendText(
        context,
        uz.subscriptionPrompt,
        subscriptionKeyboard(dependencies.mainChannelUsername),
        edit,
      );
      return null;
    }
    if (!dashboard.challenge) {
      await sendText(context, uz.noActiveChallenge, undefined, edit);
      return null;
    }
    return dashboard;
  }

  async function showDashboard(context: Context, edit: boolean): Promise<void> {
    if (!context.from) return;
    const dashboard = await dashboardFor(context, BigInt(context.from.id), edit);
    if (!dashboard) return;
    await sendText(
      context,
      uz.dashboard(dashboard, dependencies.botUsername, now()),
      dashboardKeyboard(
        dependencies.botUsername,
        dashboard.user.referralCode,
      ),
      edit,
    );
  }

  async function showStats(context: Context, edit: boolean): Promise<void> {
    if (!context.from) return;
    const dashboard = await dashboardFor(context, BigInt(context.from.id), edit);
    if (!dashboard || !dashboard.challenge) return;
    const hasAccess =
      dashboard.confirmedCount >= dashboard.challenge.referralTarget;
    await sendText(
      context,
      uz.stats(dashboard, dependencies.botUsername),
      statsKeyboard(
        dependencies.botUsername,
        dashboard.user.referralCode,
        hasAccess,
      ),
      edit,
    );
  }

  async function showTop(context: Context, edit: boolean): Promise<void> {
    if (!context.from) return;
    const dashboard = await dashboardFor(context, BigInt(context.from.id), edit);
    if (!dashboard) return;
    await sendText(
      context,
      uz.top(dashboard),
      topKeyboard(dependencies.botUsername, dashboard.user.referralCode),
      edit,
    );
  }

  async function showReferral(context: Context, edit: boolean): Promise<void> {
    if (!context.from) return;
    const dashboard = await dashboardFor(context, BigInt(context.from.id), edit);
    if (!dashboard) return;
    await sendText(
      context,
      uz.referralScreen(dashboard, dependencies.botUsername),
      referralKeyboard(dependencies.botUsername, dashboard.user.referralCode),
      edit,
    );
  }

  async function showAbout(context: Context, edit: boolean): Promise<void> {
    if (!context.from) return;
    const dashboard = await dashboardFor(context, BigInt(context.from.id), edit);
    if (!dashboard) return;
    await sendText(
      context,
      uz.about(dashboard, now()),
      dashboardKeyboard(
        dependencies.botUsername,
        dashboard.user.referralCode,
      ),
      edit,
    );
  }

  async function notifyReferrer(
    confirmation: NonNullable<
      Awaited<ReturnType<MembershipService["verify"]>>["confirmation"]
    >,
  ): Promise<void> {
    const dashboard = await dependencies.repository.getChallengeDashboard(
      confirmation.referrerTelegramId,
      now(),
    );
    if (!dashboard) return;
    const numericChatId = Number(confirmation.referrerTelegramId);
    if (!Number.isSafeInteger(numericChatId)) return;

    try {
      if (confirmation.rewardUnlocked) {
        await bot.telegram.sendMessage(
          numericChatId,
          uz.challengeUnlocked(confirmation.referralTarget),
          unlockedKeyboard(),
        );
      } else {
        await bot.telegram.sendMessage(
          numericChatId,
          uz.newReferral(
            confirmation.confirmedCount,
            confirmation.referralTarget,
          ),
          inviteAgainKeyboard(
            dependencies.botUsername,
            dashboard.user.referralCode,
          ),
        );
      }
    } catch (error) {
      dependencies.logger.error(
        {
          error,
          referrerTelegramId: confirmation.referrerTelegramId.toString(),
        },
        "Failed to notify referrer",
      );
    }
  }

  async function enterChallenge(context: Context, edit: boolean): Promise<void> {
    if (!context.from) return;
    const dashboard = await dashboardFor(context, BigInt(context.from.id), edit);
    if (!dashboard || !dashboard.challenge) return;
    if (dashboard.confirmedCount < dashboard.challenge.referralTarget) {
      await sendText(context, uz.rewardNotEligible, undefined, edit);
      return;
    }
    if (!dashboard.challenge.rewardChannelId) {
      dependencies.logger.error(
        { challengeId: dashboard.challenge.id },
        "Reward channel is not configured",
      );
      await sendText(context, uz.rewardNotReady, undefined, edit);
      return;
    }

    let inviteLink = dashboard.rewardInviteLink;
    if (!inviteLink) {
      const telegramInvite = await bot.telegram.createChatInviteLink(
        dashboard.challenge.rewardChannelId.toString(),
        {
          expire_date: Math.floor(now().getTime() / 1_000) + 7 * 24 * 60 * 60,
          member_limit: 1,
        },
      );
      inviteLink = await dependencies.repository.deliverRewardInvite({
        challengeId: dashboard.challenge.id,
        userId: dashboard.user.id,
        inviteLink: telegramInvite.invite_link,
        deliveredAt: now(),
      });
    }

    await sendText(
      context,
      uz.challengeUnlocked(dashboard.challenge.referralTarget),
      inviteLinkKeyboard(inviteLink),
      edit,
    );
  }

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
            false,
          );
          await context.reply(
            result.user.isBlocked ? uz.blocked : uz.welcome,
            result.user.isBlocked ? undefined : startKeyboard(),
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

  bot.action("begin_challenge", async (context) => {
    const updateId = BigInt(context.update.update_id);
    await context.answerCbQuery().catch(() => undefined);
    try {
      await dependencies.updateProcessor.process(
        updateId,
        "callback_query:begin_challenge",
        () => showDashboard(context, true),
      );
    } catch (error) {
      dependencies.logger.error(
        { error, updateId: updateId.toString() },
        "Failed to begin challenge",
      );
      await context.reply(uz.genericError);
    }
  });

  bot.action(/^captcha:([A-Za-z0-9_-]{20,40})$/, async (context) => {
    const updateId = BigInt(context.update.update_id);
    await context.answerCbQuery().catch(() => undefined);
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
            await sendText(context, uz.captchaInvalid, undefined, true);
            return;
          }
          const outcome = await dependencies.captchaService.verify(
            user.id,
            nonce,
            now(),
            updateId,
          );
          if (outcome === "VERIFIED") {
            await sendText(
              context,
              `${uz.captchaVerified}\n\n${uz.subscriptionPrompt}`,
              subscriptionKeyboard(dependencies.mainChannelUsername),
              true,
            );
            return;
          }
          if (outcome === "TOO_MANY_ATTEMPTS") {
            await sendText(context, uz.captchaTooManyAttempts, undefined, true);
            return;
          }
          if (outcome === "WRONG_USER" || outcome === "INVALID") {
            await sendText(context, uz.captchaInvalid, undefined, true);
            return;
          }
          await sendText(context, uz.captchaExpired, undefined, true);
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
    await context.answerCbQuery().catch(() => undefined);
    try {
      await dependencies.updateProcessor.process(
        updateId,
        "callback_query:verify_subscription",
        async () => {
          const verification = await dependencies.membershipService.verify(
            BigInt(context.from.id),
            now(),
            updateId,
          );
          const outcome = verification.outcome;
          if (outcome === "NOT_SUBSCRIBED") {
            await sendText(
              context,
              uz.subscriptionRequired,
              subscriptionKeyboard(dependencies.mainChannelUsername),
              true,
            );
            return;
          }
          if (outcome === "CAPTCHA_REQUIRED") {
            await showDashboard(context, true);
            return;
          }
          if (outcome === "BLOCKED") {
            await sendText(context, uz.blocked, undefined, true);
            return;
          }
          if (outcome === "SUSPICIOUS") {
            await sendText(context, uz.manualReview, undefined, true);
            return;
          }
          if (
            outcome === "NO_ACTIVE_CHALLENGE" ||
            outcome === "REFERRAL_NOT_ELIGIBLE"
          ) {
            await sendText(context, uz.referralNotEligible, undefined, true);
            return;
          }
          if (outcome === "USER_NOT_FOUND") {
            await sendText(context, uz.restartRequired, undefined, true);
            return;
          }

          const confirmation =
            outcome === "CONFIRMED"
              ? uz.subscriptionConfirmedWithReferral
              : uz.subscriptionConfirmed;
          await sendText(context, confirmation, undefined, true);
          await showDashboard(context, false);
          if (verification.confirmation) {
            await notifyReferrer(verification.confirmation);
          }
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

  function registerCommand(
    command: string,
    handler: (context: Context, edit: boolean) => Promise<void>,
  ): void {
    bot.command(command, async (context) => {
      const updateId = BigInt(context.update.update_id);
      try {
        await dependencies.updateProcessor.process(
          updateId,
          `message:${command}`,
          () => handler(context, false),
        );
      } catch (error) {
        dependencies.logger.error(
          { error, updateId: updateId.toString(), command },
          "Failed to process command",
        );
        await context.reply(uz.genericError);
      }
    });
  }

  function registerAction(
    action: string,
    handler: (context: Context, edit: boolean) => Promise<void>,
  ): void {
    bot.action(action, async (context) => {
      const updateId = BigInt(context.update.update_id);
      await context.answerCbQuery().catch(() => undefined);
      try {
        await dependencies.updateProcessor.process(
          updateId,
          `callback_query:${action}`,
          () => handler(context, true),
        );
      } catch (error) {
        dependencies.logger.error(
          { error, updateId: updateId.toString(), action },
          "Failed to process callback",
        );
        await context.reply(uz.genericError);
      }
    });
  }

  registerCommand("stats", showStats);
  registerCommand("top", showTop);
  registerCommand("ref", showReferral);
  registerCommand("help", showDashboard);
  registerAction("show_stats", showStats);
  registerAction("show_top", showTop);
  registerAction("show_referral", showReferral);
  registerAction("show_about", showAbout);
  registerAction("enter_challenge", enterChallenge);

  bot.catch((error, context) => {
    dependencies.logger.error(
      { error, updateId: context.update.update_id },
      "Unhandled Telegram bot error",
    );
  });

  return bot;
}
