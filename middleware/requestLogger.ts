// src/middleware/requestLogger.ts
import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger.js";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on("finish", () => {
    const ms = Date.now() - start;
    logger.info(
      {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        responseTime: ms + "ms",
      },
      `HTTP ${req.method} ${req.originalUrl}`
    );
  });

  next();
}
