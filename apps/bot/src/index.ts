import "dotenv/config";

import {
  disconnectDatabase,
  getPrismaClient,
} from "@telegram-referral/database";
import { createLogger, parseServerEnv } from "@telegram-referral/shared";
import { Telegram } from "telegraf";

import { createBot } from "./bot/create-bot.js";
import { PrismaBotRepository } from "./repositories/prisma-bot.repository.js";
import { secureTokenGenerator } from "./security/tokens.js";
import { CaptchaService } from "./services/captcha.service.js";
import { FraudService } from "./services/fraud.service.js";
import { MembershipService } from "./services/membership.service.js";
import { OnboardingService } from "./services/onboarding.service.js";
import { ReferralService } from "./services/referral.service.js";
import { UpdateProcessorService } from "./services/update-processor.service.js";

const environment = parseServerEnv();
const logger = createLogger("telegram-referral-bot", environment.LOG_LEVEL);

if (!environment.MAIN_CHANNEL_USERNAME) {
  throw new Error("MAIN_CHANNEL_USERNAME is required to start the bot");
}
if (!environment.MAIN_CHANNEL_ID) {
  throw new Error("MAIN_CHANNEL_ID is required to start the bot");
}

const repository = new PrismaBotRepository(getPrismaClient());
const mainChannelId = BigInt(environment.MAIN_CHANNEL_ID);
const telegram = new Telegram(environment.TELEGRAM_BOT_TOKEN);
const membershipService = new MembershipService(
  repository,
  {
    async getChatMember(channelId, telegramUserId) {
      const numericUserId = Number(telegramUserId);
      if (!Number.isSafeInteger(numericUserId)) {
        throw new Error(
          "Telegram user ID exceeds JavaScript safe integer range"
        );
      }
      const member = await telegram.getChatMember(
        channelId.toString(),
        numericUserId
      );
      return {
        status: member.status,
        ...("is_member" in member ? { isMember: member.is_member } : {}),
      };
    },
  },
  mainChannelId
);
const fraudService = new FraudService();
const captchaService = new CaptchaService(
  repository,
  secureTokenGenerator,
  environment.CAPTCHA_TTL_SECONDS,
  environment.CAPTCHA_MAX_ATTEMPTS
);
const referralService = new ReferralService(
  repository,
  fraudService,
  secureTokenGenerator
);
const onboardingService = new OnboardingService(
  repository,
  referralService,
  captchaService,
  secureTokenGenerator
);
const updateProcessor = new UpdateProcessorService(repository);
const bot = createBot(environment.TELEGRAM_BOT_TOKEN, {
  repository,
  onboardingService,
  captchaService,
  membershipService,
  updateProcessor,
  botUsername: environment.TELEGRAM_BOT_USERNAME,
  mainChannelUsername: environment.MAIN_CHANNEL_USERNAME,
  logger,
});

await bot.launch({
  allowedUpdates: ["message", "callback_query", "chat_member"],
});
logger.info({ mode: "long-polling" }, "Telegram bot started");

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Stopping Telegram bot");
  bot.stop(signal);
  await disconnectDatabase();
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});
process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});
