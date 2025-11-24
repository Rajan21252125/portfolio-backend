import { logger } from "../lib/logger.ts";
export function requestLogger(req, res, next) {
    const start = Date.now();
    res.on("finish", () => {
        const ms = Date.now() - start;
        logger.info({
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            responseTime: ms + "ms",
        }, `HTTP ${req.method} ${req.originalUrl}`);
    });
    next();
}
