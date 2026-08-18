import { createHash } from "node:crypto";

import type { TokenGenerator } from "../src/security/tokens.js";

export function createTestTokens(): TokenGenerator {
  let id = 0;
  let referral = 0;
  let captcha = 0;
  return {
    entityId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    referralCode: () => `refcode${String(++referral).padStart(5, "0")}`,
    captchaNonce: () => `captcha_nonce_${String(++captcha).padStart(8, "0")}`,
    hash: (value) => createHash("sha256").update(value).digest("hex"),
  };
}
