export interface TelegramUserProfile {
  telegramId: bigint;
  username: string | null;
  firstName: string;
  lastName: string | null;
  languageCode: string | null;
}

export interface BotUserRecord extends TelegramUserProfile {
  id: string;
  referralCode: string;
  captchaVerified: boolean;
  isSubscribed: boolean;
  subscriptionCheckedAt: Date | null;
  isBlocked: boolean;
  isSuspicious: boolean;
}

export interface ActiveChallengeRecord {
  id: string;
  name: string;
  description: string;
  referralTarget: number;
  startDate: Date;
  endDate: Date;
  rewardDescription: string;
  rulesText: string;
  rewardChannelId: bigint | null;
  rewardChannelUsername: string | null;
}

export interface LeaderboardEntry {
  telegramId: bigint;
  username: string | null;
  firstName: string;
  confirmedCount: number;
}

export interface ChallengeDashboardRecord {
  user: BotUserRecord;
  challenge: ActiveChallengeRecord | null;
  invitedCount: number;
  pendingCount: number;
  confirmedCount: number;
  remainingCount: number;
  rank: number | null;
  leaderboard: LeaderboardEntry[];
  rewardInviteLink: string | null;
}

export interface ReferralConfirmationRecord {
  referrerTelegramId: bigint;
  challengeId: string;
  confirmedCount: number;
  referralTarget: number;
  remainingCount: number;
  rewardUnlocked: boolean;
}

export interface ReferralRecord {
  id: string;
  referrerId: string;
  referredUserId: string;
  challengeId: string;
}

export type ReferralAttributionOutcome =
  | "NO_PAYLOAD"
  | "INVALID_PAYLOAD"
  | "NO_ACTIVE_CHALLENGE"
  | "REFERRER_NOT_FOUND"
  | "REFERRER_BLOCKED"
  | "SELF_REFERRAL"
  | "CREATED"
  | "ALREADY_ATTRIBUTED";

export type CaptchaVerificationOutcome =
  | "VERIFIED"
  | "INVALID"
  | "WRONG_USER"
  | "EXPIRED"
  | "ALREADY_USED"
  | "TOO_MANY_ATTEMPTS";

export type MembershipVerificationOutcome =
  | "CONFIRMED"
  | "ALREADY_CONFIRMED"
  | "VERIFIED_NO_REFERRAL"
  | "NOT_SUBSCRIBED"
  | "USER_NOT_FOUND"
  | "CAPTCHA_REQUIRED"
  | "BLOCKED"
  | "SUSPICIOUS"
  | "NO_ACTIVE_CHALLENGE"
  | "REFERRAL_NOT_ELIGIBLE";

export interface MembershipVerificationResult {
  outcome: MembershipVerificationOutcome;
  confirmation: ReferralConfirmationRecord | null;
}

export interface StartOnboardingResult {
  user: BotUserRecord;
  attribution: ReferralAttributionOutcome;
  captchaNonce: string | null;
}
