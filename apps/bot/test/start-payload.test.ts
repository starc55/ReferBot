import { describe, expect, it } from "vitest";

import {
  extractStartPayload,
  parseReferralCode,
} from "../src/utils/start-payload.js";

describe("Telegram start payload", () => {
  it("extracts an opaque referral token from a deep link command", () => {
    const payload = extractStartPayload("/start@challenge_bot ref_a8K29cxQ");

    expect(payload).toBe("ref_a8K29cxQ");
    expect(parseReferralCode(payload)).toBe("a8K29cxQ");
  });

  it.each(["/start ref_123", "/start referral_code", "/start ref_bad token"])(
    "rejects malformed payload command: %s",
    (command) => {
      expect(parseReferralCode(extractStartPayload(command))).toBeNull();
    },
  );
});
