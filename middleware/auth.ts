// src/middleware/auth.ts
import type { Request, Response, NextFunction } from "express"; // type-only import (erased at runtime)
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser"; // only if you need to parse cookies here (usually app-level)

// Custom request type so we can attach `user`
export interface AuthRequest extends Request {
  user?: any;
}

export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  // If you use cookie-parser at app level, cookies are available here.
  const token =
    // try cookies first (if you set cookie from login)
    (req as any).cookies?.portfolio_token ||
    // fallback to Authorization header: "Bearer <token>"
    req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};
