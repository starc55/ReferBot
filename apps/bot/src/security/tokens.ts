import { createHash, randomBytes, randomUUID } from "node:crypto";

export interface TokenGenerator {
  referralCode(): string;
  captchaNonce(): string;
  entityId(): string;
  hash(value: string): string;
}

export const secureTokenGenerator: TokenGenerator = {
  referralCode: () => randomBytes(9).toString("base64url"),
  captchaNonce: () => randomBytes(18).toString("base64url"),
  entityId: () => randomUUID(),
  hash: (value) => createHash("sha256").update(value).digest("hex"),
};
