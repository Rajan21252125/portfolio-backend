import fs from "fs";
import path from "path";
import { logger } from "./logger.ts";
const LOG_DIR = path.resolve("logs");
const MAX_DAYS = 30; // delete files older than 30 days
export function cleanOldLogs() {
    try {
        if (!fs.existsSync(LOG_DIR)) {
            logger.warn({ LOG_DIR }, "Log directory does not exist, skipping retention cleanup");
            return;
        }
        logger.info("Running log retention cleanup...");
        const now = Date.now();
        const files = fs.readdirSync(LOG_DIR);
        for (const file of files) {
            const filePath = path.join(LOG_DIR, file);
            const stat = fs.statSync(filePath);
            // Skip directories
            if (!stat.isFile())
                continue;
            const ageDays = (now - stat.mtimeMs) / (1000 * 60 * 60 * 24);
            if (ageDays > MAX_DAYS) {
                fs.unlinkSync(filePath);
                logger.info({ file }, `Deleted old log file (${ageDays.toFixed(1)} days old)`);
            }
        }
        logger.info("Log retention cleanup complete.");
    }
    catch (err) {
        logger.error({ err }, "Failed to clean old log files");
    }
}
