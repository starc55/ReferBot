const referralPayloadPattern = /^ref_([A-Za-z0-9_-]{8,32})$/;

export function extractStartPayload(commandText: string): string | null {
  const match = /^\/start(?:@[A-Za-z0-9_]+)?(?:\s+([^\s]+))?\s*$/.exec(
    commandText,
  );
  return match?.[1] ?? null;
}

export function parseReferralCode(payload: string | null): string | null {
  if (!payload) {
    return null;
  }

  return referralPayloadPattern.exec(payload)?.[1] ?? null;
}
