import crypto from "node:crypto";

export function generateUserId() {
  const randomPart = crypto
    .randomBytes(6)
    .toString("base64url")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);

  return `USR-${randomPart}`;
}