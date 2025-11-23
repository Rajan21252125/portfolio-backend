// src/middleware/errorLogger.ts
import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger.ts";

export function errorLogger(err: any, req: Request, res: Response, next: NextFunction) {
  logger.error(
    {
      error: err?.message,
      stack: err?.stack,
      url: req.originalUrl,
      method: req.method,
    },
    "Unhandled error"
  );

  return res.status(500).json({
    message: "Internal server error",
  });
}
