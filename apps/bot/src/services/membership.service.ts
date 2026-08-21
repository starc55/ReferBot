import type { MembershipVerificationResult } from "../domain/types.js";
import type { BotRepository } from "../repositories/bot-repository.js";

export interface TelegramMembership {
  status: string;
  isMember?: boolean;
}

export interface MembershipGateway {
  getChatMember(
    channelId: bigint,
    telegramUserId: bigint,
  ): Promise<TelegramMembership>;
}

function isSubscribedMember(member: TelegramMembership): boolean {
  if (
    member.status === "creator" ||
    member.status === "administrator" ||
    member.status === "member"
  ) {
    return true;
  }

  return member.status === "restricted" && member.isMember === true;
}

export class MembershipService {
  public constructor(
    private readonly repository: BotRepository,
    private readonly gateway: MembershipGateway,
    private readonly channelId: bigint,
  ) {}

  public async verify(
    telegramUserId: bigint,
    now: Date,
    telegramUpdateId: bigint,
  ): Promise<MembershipVerificationResult> {
    const user =
      await this.repository.findUserByTelegramId(telegramUserId);
    if (!user) {
      return { outcome: "USER_NOT_FOUND", confirmation: null };
    }

    const member = await this.gateway.getChatMember(
      this.channelId,
      telegramUserId,
    );

    return this.repository.applyMembershipCheck({
      userId: user.id,
      channelId: this.channelId,
      telegramStatus: member.status,
      isSubscribed: isSubscribedMember(member),
      telegramUpdateId,
      checkedAt: now,
    });
  }
}
