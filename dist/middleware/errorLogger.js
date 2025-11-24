import { logger } from "../lib/logger.ts";
export function errorLogger(err, req, res, next) {
    logger.error({
        error: err?.message,
        stack: err?.stack,
        url: req.originalUrl,
        method: req.method,
    }, "Unhandled error");
    return res.status(500).json({
        message: "Internal server error",
    });
}
