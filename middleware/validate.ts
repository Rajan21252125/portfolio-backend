// src/middleware/validate.ts
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger.js";

export const validate =
  (schema: z.ZodTypeAny) =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
        code: issue.code,
      }));

      logger.error(issues, "error in validating a data")
      return res.status(400).json({
        message: "Validation error",
        errors: issues,
      });
    }

    req.body = result.data;
    next();
  };
