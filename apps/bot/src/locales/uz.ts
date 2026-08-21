import type { ChallengeDashboardRecord } from "../domain/types.js";

const challengeBrand = "🏆 30 DAYS TO YOUR US🇺🇸DREAM";

function referralLink(botUsername: string, referralCode: string): string {
  return `https://t.me/${botUsername}?start=ref_${referralCode}`;
}

function countdown(endDate: Date, now: Date): string {
  const remainingMs = Math.max(endDate.getTime() - now.getTime(), 0);
  const days = Math.floor(remainingMs / 86_400_000);
  const hours = Math.floor((remainingMs % 86_400_000) / 3_600_000);
  return days > 0 ? `${days} kun ${hours} soat` : `${hours} soat`;
}

function progressBar(current: number, target: number): string {
  const filled = Math.min(10, Math.round((current / Math.max(target, 1)) * 10));
  return `${"🟩".repeat(filled)}${"⬜".repeat(10 - filled)}`;
}

function participantName(username: string | null, firstName: string): string {
  return username ? `@${username}` : firstName;
}

export const uz = {
  challengeBrand,
  welcome: `🚀 CHALLENGE ga QO‘SHILISH

Salom! 👋

Siz yangi ${challengeBrand} challenge’iga qo‘shilishga bir qadam qoldingiz.

AQSh 🇺🇸 universitetlari — bu shunchaki orzu emas. To‘g‘ri strategiya bilan unga olib boradigan yo‘l bor va bu yo‘lni biz sizga 30 kun davomida bosqichma-bosqich ochib beramiz. 🔥

🎁 Challenge boshlanishidan oldin kanalda eng kerakli bepul materiallar ulashiladi va yakunda faol ishtirokchilar uchun maxsus “Bomba” taklifimiz ham bor.

🔥 Challenge’ga kirish uchun 5 ta do‘stingizni taklif qiling.

Har bir do‘stingiz sizning linkingiz orqali kirib, shartlarni bajarganida hisoblanadi.

👇 Boshlash uchun tugmani bosing:`,
  startButton: "🚀 Boshlash",
  captchaPrompt:
    "🤖 Bot emasligingizni tasdiqlang\n\nDavom etish uchun quyidagi tugmani bosing.",
  captchaButton: "✅ Men insonman",
  captchaExpired:
    "⌛ Captcha muddati tugagan yoki allaqachon ishlatilgan.\n\n/start buyrug‘ini qayta yuboring.",
  captchaInvalid:
    "❌ Captcha tasdiqlanmadi.\n\n/start buyrug‘ini qayta yuboring.",
  captchaTooManyAttempts:
    "⚠️ Juda ko‘p urinish qilindi.\n\nBirozdan keyin /start buyrug‘ini qayta yuboring.",
  captchaVerified: "✅ Bot emasligingiz tasdiqlandi!",
  subscriptionPrompt:
    "📢 Challenge’da qatnashish uchun kanalimizga obuna bo‘ling.\n\n1️⃣ Kanalga o‘ting\n2️⃣ Obuna bo‘ling\n3️⃣ “Obunani tekshirish” tugmasini bosing",
  openChannelButton: "📢 Kanalga o‘tish",
  verifySubscriptionButton: "✅ Obunani tekshirish",
  subscriptionRequired:
    "❌ Siz hali kanalga obuna bo‘lmagansiz.\n\nAvval kanalga obuna bo‘ling va qayta tekshiring.",
  subscriptionConfirmed:
    "✅ Obuna tasdiqlandi!\n\nEndi shaxsiy linkingiz orqali do‘stlaringizni taklif qilishingiz mumkin.",
  subscriptionConfirmedWithReferral:
    "✅ Obuna va referral tasdiqlandi!\n\nSizni taklif qilgan do‘stingizga +1 yozildi.",
  shareButton: "📤 Do‘stlarni taklif qilish",
  shareLinkButton: "📤 Linkni ulashish",
  progressButton: "📊 Progressim",
  topButton: "🏆 TOP",
  aboutButton: "ℹ️ Challenge haqida",
  enterChallengeButton: "🚀 CHALLENGE’GA KIRISH",
  inviteAgainButton: "📤 Yana do‘st taklif qilish",
  dashboard: (dashboard: ChallengeDashboardRecord, botUsername: string, now: Date) => {
    const challenge = dashboard.challenge;
    if (!challenge) return "⌛ Hozir aktiv challenge mavjud emas.";
    return `📊 Sizning progress

${progressBar(dashboard.confirmedCount, challenge.referralTarget)}
👥 Taklif qilingan: ${dashboard.confirmedCount}/${challenge.referralTarget}
⏳ Challenge tugashiga: ${countdown(challenge.endDate, now)}

${challenge.referralTarget} ta real ishtirokchi yig‘ilgach, challenge kanaliga kirish imkoniyati ochiladi.

🔗 Sizning shaxsiy linkingiz:
${referralLink(botUsername, dashboard.user.referralCode)}

Do‘stlaringizga yuboring 👇`;
  },
  referralScreen: (dashboard: ChallengeDashboardRecord, botUsername: string) => {
    const target = dashboard.challenge?.referralTarget ?? 5;
    return `🔥 ${target} TA DO‘STNI TAKLIF QILING

Challenge’ga qo‘shilish uchun sizga atigi ${target} ta real ishtirokchi kerak.

👇 Shaxsiy linkingizni do‘stlaringizga yuboring:

🔗 ${referralLink(botUsername, dashboard.user.referralCode)}

Har bir do‘stingiz link orqali kirib, kerakli shartlarni bajarsa:

✅ +1 ishtirokchi

Hozirgi natijangiz:

${dashboard.confirmedCount}/${target} 👥

💡 Maslahat: linkingizni bir nechta do‘stlaringizga birdan yuboring — ${target} taga tezroq yetasiz.`;
  },
  newReferral: (confirmedCount: number, target: number) => `🎉 YANGI ISHTIROKCHI!

Sizning linkingiz orqali yangi ishtirokchi qo‘shildi.

📊 Progress: ${confirmedCount}/${target}

Yana ${Math.max(target - confirmedCount, 0)} ta do‘st qoldi! 🔥

Davom eting — challenge’ga tobora yaqinlashyapsiz.`,
  challengeUnlocked: (target: number) => `🎉 TABRIKLAYMIZ! ${target}/${target}

Siz kerakli ${target} ta ishtirokchini muvaffaqiyatli taklif qildingiz! 🔥

Endi siz ${challengeBrand} challenge’iga qo‘shilishingiz mumkin.

👇 Quyidagi tugmani bosib challenge kanaliga kiring:

Omad! 💪
Challenge’da ko‘rishamiz.`,
  stats: (dashboard: ChallengeDashboardRecord, botUsername: string) => {
    const target = dashboard.challenge?.referralTarget ?? 5;
    const access = dashboard.confirmedCount >= target ? "✅ BOR" : "❌ YO‘Q";
    return `📊 SIZNING NATIJANGIZ

👥 Taklif qilingan: ${dashboard.invitedCount}
✅ Tasdiqlangan: ${dashboard.confirmedCount}
⏳ Qolgan: ${dashboard.remainingCount}

🏆 Reytingdagi o‘rningiz: ${dashboard.rank ? `#${dashboard.rank}` : "—"}

🔗 Shaxsiy referral linkingiz:
${referralLink(botUsername, dashboard.user.referralCode)}

Challenge’ga kirish huquqi: ${access}`;
  },
  top: (dashboard: ChallengeDashboardRecord) => {
    const medals = ["🥇", "🥈", "🥉"];
    const rows = dashboard.leaderboard.length
      ? dashboard.leaderboard.map((entry, index) =>
          `${medals[index] ?? `${index + 1}.`} ${index + 1}. ${participantName(entry.username, entry.firstName)} — ${entry.confirmedCount} ta`,
        )
      : ["Hali tasdiqlangan referral yo‘q."];
    return `🏆 TOP REFERRERLAR

Eng ko‘p real ishtirokchi taklif qilganlar:

${rows.join("\n")}

🔥 Sizning natijangiz: ${dashboard.confirmedCount} ta

Yuqoriga chiqish hali ham mumkin.

Do‘stlaringizni taklif qiling va TOPga kirishga harakat qiling! 🚀`;
  },
  about: (dashboard: ChallengeDashboardRecord, now: Date) => {
    const challenge = dashboard.challenge;
    if (!challenge) return "⌛ Hozir aktiv challenge mavjud emas.";
    return `ℹ️ ${challengeBrand}

${challenge.description}

🎯 Shart: ${challenge.referralTarget} ta real ishtirokchini taklif qilish.
🎁 Mukofot: ${challenge.rewardDescription}
⏳ Tugashiga: ${countdown(challenge.endDate, now)}

${challenge.rulesText}`;
  },
  shareText: (botUsername: string, referralCode: string) => `🚀 Men ${challengeBrand} challenge’iga qo‘shilyapman!

Sen ham qo‘shilmoqchi bo‘lsang, shu link orqali kir 👇

🔗 ${referralLink(botUsername, referralCode)}

5 ta do‘stni taklif qilasan va challenge’ga qo‘shilasan. 🔥`,
  captchaRequired:
    "🤖 Avval bot emasligingizni tasdiqlang. Quyidagi tugmani bosing:",
  restartRequired:
    "ℹ️ Foydalanuvchi topilmadi.\n\n/start buyrug‘ini yuboring.",
  referralNotEligible:
    "⌛ Referral aktiv challenge talablariga mos kelmadi.",
  manualReview: "⚠️ Hisobingiz qo‘shimcha tekshiruvga yuborildi.",
  blocked:
    "⛔ Hisobingiz bloklangan. Qo‘shimcha ma’lumot uchun administrator bilan bog‘laning.",
  noActiveChallenge: "⌛ Hozir aktiv challenge mavjud emas.",
  rewardNotReady:
    "⚠️ Challenge kanali hozircha ulanmagan. Administratorga xabar yuborildi.",
  rewardNotEligible:
    "⏳ Challenge kanaliga kirish uchun avval 5 ta tasdiqlangan ishtirokchi yig‘ing.",
  genericError:
    "⚠️ Xatolik yuz berdi.\n\nIltimos, birozdan keyin qayta urinib ko‘ring.",
  referralLink,
} as const;
