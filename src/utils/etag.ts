import crypto from "crypto";

export function generateWeakEtag(payload: unknown): string {
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");

  return `W/"${hash}"`;
}

