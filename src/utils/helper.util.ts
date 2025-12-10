import { BinaryLike, KeyObject, createHmac, timingSafeEqual } from "crypto";

export const getSignature = ({
  secret,
  body,
  timestamp,
}: {
  secret: BinaryLike | KeyObject;
  body: Buffer | string;
  timestamp: number;
}): string => {
  return createHmac("sha256", secret)
    .update(`${timestamp}:${body}`)
    .digest("hex");
};

const MILLISECONDS_IN_MINUTE = 1000 * 60;

export function verifySignature(
  body: string | Buffer,
  signature: string,
  secret: string,
): boolean {
  // Simplified verification - check if signature matches
  const hmac = createHmac("sha256", secret);
  const hash = `sha256=${hmac.update(body).digest("hex")}`;
  try {
    return timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch {
    return false;
  }
}

export function extractDomainFromEmail(email: string): string | null {
  const match = email.match(/@(.+)$/);
  return match ? match[1].toLowerCase() : null;
}

export function generateIdempotencyKey(
  resourceId: string,
  occurredAt: Date,
): string {
  return `${resourceId}:${occurredAt.toISOString()}`;
}
