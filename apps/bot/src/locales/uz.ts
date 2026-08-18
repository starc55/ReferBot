export const uz = {
  captchaPrompt:
    "🤖 Bot emasligingizni tasdiqlang\n\nDavom etish uchun quyidagi tugmani bosing.",
  captchaButton: "✅ Men insonman",
  captchaExpired:
    "⌛ Captcha muddati tugagan yoki allaqachon ishlatilgan.\n\n/start buyrug'ini qayta yuboring.",
  captchaInvalid:
    "❌ Captcha tasdiqlanmadi.\n\n/start buyrug'ini qayta yuboring.",
  captchaTooManyAttempts:
    "⚠️ Juda ko'p urinish qilindi.\n\nBirozdan keyin /start buyrug'ini qayta yuboring.",
  captchaVerified: "✅ Bot emasligingiz tasdiqlandi!",
  subscriptionPrompt:
    "📢 Challenge'da qatnashish uchun kanalimizga obuna bo'ling.\n\n1️⃣ Kanalga o'ting\n2️⃣ Obuna bo'ling\n3️⃣ “Obunani tekshirish” tugmasini bosing",
  openChannelButton: "📢 Kanalga o'tish",
  verifySubscriptionButton: "✅ Obunani tekshirish",
  subscriptionRequired:
    "❌ Siz hali kanalga obuna bo'lmagansiz.\n\nAvval kanalga obuna bo'ling va qayta tekshiring.",
  subscriptionConfirmed:
    "✅ Obuna tasdiqlandi!\n\nSiz challenge'da qatnashishingiz mumkin.",
  subscriptionConfirmedWithReferral:
    "✅ Obuna va referral tasdiqlandi!\n\nTaklif qilgan do'stingizga referral yozildi.",
  referralLink: (botUsername: string, referralCode: string) =>
    `🔗 Sizning shaxsiy referral linkingiz:\n\nhttps://t.me/${botUsername}?start=ref_${referralCode}\n\nDo'stlaringizga ushbu linkni yuboring. Faqat botga kirgan, captcha tasdiqlagan va kanalga obuna bo'lgan do'stlaringiz hisoblanadi.`,
  captchaRequired:
    "🤖 Avval captcha tasdig'idan o'ting.\n\n/start buyrug'ini qayta yuboring.",
  restartRequired:
    "ℹ️ Foydalanuvchi topilmadi.\n\n/start buyrug'ini yuboring.",
  referralNotEligible:
    "⌛ Referral aktiv challenge talablariga mos kelmadi.",
  manualReview:
    "⚠️ Hisobingiz qo'shimcha tekshiruvga yuborildi.",
  blocked:
    "⛔ Hisobingiz bloklangan. Qo'shimcha ma'lumot uchun administrator bilan bog'laning.",
  genericError:
    "⚠️ Xatolik yuz berdi.\n\nIltimos, birozdan keyin qayta urinib ko'ring.",
} as const;
