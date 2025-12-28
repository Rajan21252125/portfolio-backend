import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

// import your routes
import profileRoutes from "./routes/profile.routes.ts";
import projectRoutes from "./routes/projects.routes.ts";
import authRoutes from "./routes/auth.routes.ts";
import { requestLogger } from "./middleware/requestLogger.ts";
import { errorLogger } from "./middleware/errorLogger.ts";
import cron from "node-cron";
import { cleanOldLogs } from "./lib/logRetention.ts";


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
app.use((err, req, res, next) => {
  console.error("GLOBAL ERROR:", err);
  res.status(500).json({ message: "Internal Server Error" });
});


const isVercel = process.env.VERCEL === "1";

if (!isVercel) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Local server running on http://localhost:${PORT}`);
  });
}

export default app;
