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
// run immediately at startup
cleanOldLogs();
// run cleanup every day at 03:00 AM
cron.schedule("0 3 * * *", () => {
    cleanOldLogs();
});
// ===== MIDDLEWARE =====
app.use(helmet()); // security headers
app.use(cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
}));
app.use(express.json({ limit: "1mb" })); // prevent big payload attacks
app.use(cookieParser());
// ===== ROUTES =====
app.get("/", (req, res) => {
    res.send("Portfolio Backend Running 🚀");
});
// === Request logging ===
app.use(requestLogger);
// === Error logging ===
app.use(errorLogger);
// prefix routes
app.use("/auth", authRoutes);
app.use("/profile", profileRoutes);
app.use("/projects", projectRoutes);
// ===== GLOBAL ERROR HANDLER =====
app.use((err, req, res, next) => {
    console.error("GLOBAL ERROR:", err);
    res.status(500).json({ message: "Internal Server Error" });
});
// ===== START SERVER =====
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port http://localhost:${PORT}`);
});
