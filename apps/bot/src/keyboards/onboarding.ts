import { Markup } from "telegraf";

import { uz } from "../locales/uz.js";

export function captchaKeyboard(nonce: string) {
  return Markup.inlineKeyboard([
    Markup.button.callback(uz.captchaButton, `captcha:${nonce}`),
  ]);
}

export function subscriptionKeyboard(mainChannelUsername: string) {
  const normalizedUsername = mainChannelUsername.replace(/^@/, "");
  return Markup.inlineKeyboard([
    [
      Markup.button.url(
        uz.openChannelButton,
        `https://t.me/${normalizedUsername}`,
      ),
    ],
    [Markup.button.callback(uz.verifySubscriptionButton, "verify_subscription")],
  ]);
}
