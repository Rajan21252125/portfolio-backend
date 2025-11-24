// src/lib/logger.ts
import pino from "pino";
import path from "path";
import fs from "fs";
import * as rfs from "rotating-file-stream";
// Create logs directory if missing
const logsDir = path.resolve("logs");
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}
// Create rotating stream (daily)
const rotatingStream = rfs.createStream("app.log", {
    interval: "1d", // rotate daily
    path: logsDir,
    size: "20M", // rotate early if > 20MB
    maxFiles: 30, // keep 30 days
});
const isProd = process.env.NODE_ENV === "production";
export const logger = pino({
    level: process.env.LOG_LEVEL || "debug",
    base: undefined, // remove pid/hostname for cleaner logs
    timestamp: pino.stdTimeFunctions.isoTime,
}, pino.multistream([
    // 1. Console output (pretty in dev)
    !isProd
        ? {
            stream: pino.transport({
                target: "pino-pretty",
                options: { colorize: true, translateTime: "SYS:standard" },
            }),
        }
        : null,
    // 2. Rotating file stream
    { stream: rotatingStream },
].filter(Boolean)));
