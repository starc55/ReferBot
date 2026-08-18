import type { BotRepository } from "../repositories/bot-repository.js";

export class UpdateProcessorService {
  public constructor(private readonly repository: BotRepository) {}

  public async process(
    updateId: bigint,
    updateType: string,
    operation: () => Promise<void>,
  ): Promise<boolean> {
    const claimed = await this.repository.claimTelegramUpdate(
      updateId,
      updateType,
    );
    if (!claimed) {
      return false;
    }

    try {
      await operation();
      await this.repository.completeTelegramUpdate(updateId, new Date());
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await this.repository.failTelegramUpdate(
        updateId,
        new Date(),
        message.slice(0, 2_000),
      );
      throw error;
    }
  }
}
