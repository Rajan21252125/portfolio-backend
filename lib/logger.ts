import pino from "pino";

/**
 * Environment detection
 * - VERCEL is automatically set to "1" on Vercel
 * - NODE_ENV === "production" in production builds
 */
const isVercel = process.env.VERCEL === "1";
const isProd = process.env.NODE_ENV === "production";

/**
 * Create logger
 *
 * - Local dev  → pretty logs (pino-pretty)
 * - Vercel    → JSON logs to stdout (no transports, no fs)
 */
export const logger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    base: undefined, // remove pid & hostname
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  isProd || isVercel
    ? undefined // ✅ Serverless-safe (stdout JSON)
    : pino.transport({
        // ✅ Local dev only
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      })
);
