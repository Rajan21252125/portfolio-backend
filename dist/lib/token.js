// src/lib/tokens.ts
import * as crypto from "crypto";
export function generateTokenHex(bytes = 32) {
    return crypto.randomBytes(bytes).toString("hex"); // plain token for email
}
export function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}
