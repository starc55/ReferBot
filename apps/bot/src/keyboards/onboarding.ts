import { Markup } from "telegraf";

import { uz } from "../locales/uz.js";

export function startKeyboard() {
  return Markup.inlineKeyboard([
    Markup.button.callback(uz.startButton, "begin_challenge"),
  ]);
}

export function captchaKeyboard(nonce: string) {
  return Markup.inlineKeyboard([
    Markup.button.callback(uz.captchaButton, `captcha:${nonce}`),
  ]);
}

export function subscriptionKeyboard(mainChannelUsername: string) {
  const normalizedUsername = mainChannelUsername.replace(/^@/, "");
  return Markup.inlineKeyboard([
    [Markup.button.url(uz.openChannelButton, `https://t.me/${normalizedUsername}`)],
    [Markup.button.callback(uz.verifySubscriptionButton, "verify_subscription")],
  ]);
}

export function shareUrl(botUsername: string, referralCode: string): string {
  const link = uz.referralLink(botUsername, referralCode);
  const text = uz.shareText(botUsername, referralCode).replace(`\n\n🔗 ${link}`, "");
  return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
}

export function dashboardKeyboard(botUsername: string, referralCode: string) {
  return Markup.inlineKeyboard([
    [Markup.button.url(uz.shareButton, shareUrl(botUsername, referralCode))],
    [
      Markup.button.callback(uz.progressButton, "show_stats"),
      Markup.button.callback(uz.topButton, "show_top"),
    ],
    [Markup.button.callback(uz.aboutButton, "show_about")],
  ]);
}

export function referralKeyboard(botUsername: string, referralCode: string) {
  return Markup.inlineKeyboard([
    [Markup.button.url(uz.shareLinkButton, shareUrl(botUsername, referralCode))],
    [Markup.button.callback(uz.progressButton, "show_stats")],
  ]);
}

export function statsKeyboard(
  botUsername: string,
  referralCode: string,
  hasAccess: boolean,
) {
  const rows = [];
  if (hasAccess) {
    rows.push([Markup.button.callback(uz.enterChallengeButton, "enter_challenge")]);
  }
  rows.push([Markup.button.callback(uz.topButton, "show_top")]);
  rows.push([Markup.button.url(uz.shareButton, shareUrl(botUsername, referralCode))]);
  return Markup.inlineKeyboard(rows);
}

export function topKeyboard(botUsername: string, referralCode: string) {
  return Markup.inlineKeyboard([
    [Markup.button.url(uz.shareButton, shareUrl(botUsername, referralCode))],
    [Markup.button.callback(uz.progressButton, "show_stats")],
  ]);
}

export function unlockedKeyboard() {
  return Markup.inlineKeyboard([
    Markup.button.callback(uz.enterChallengeButton, "enter_challenge"),
  ]);
}

export function inviteAgainKeyboard(botUsername: string, referralCode: string) {
  return Markup.inlineKeyboard([
    Markup.button.url(uz.inviteAgainButton, shareUrl(botUsername, referralCode)),
  ]);
}

export function inviteLinkKeyboard(inviteLink: string) {
  return Markup.inlineKeyboard([
    Markup.button.url(uz.enterChallengeButton, inviteLink),
  ]);
}
