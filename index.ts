import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import type { Request, Response, NextFunction } from "express";


// import your routes
import profileRoutes from "./routes/profile.routes.js";
import projectRoutes from "./routes/projects.routes.js";
import authRoutes from "./routes/auth.routes.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { errorLogger } from "./middleware/errorLogger.js";


const app = express();

// ===== MIDDLEWARE =====
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// ===== ROUTES =====
app.get("/", (req, res) => {
  res.send("Portfolio Backend Running 🚀");
});

app.use(requestLogger);

app.use("/auth", authRoutes);
app.use("/profile", profileRoutes);
app.use("/projects", projectRoutes);

app.use(errorLogger);

// ===== GLOBAL ERROR HANDLER =====
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  console.error("GLOBAL ERROR:", err);
  res.status(500).json({ message: "Internal Server Error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Local server running on http://localhost:${PORT}`);
})
