import { cleanOldLogs } from "../../lib/logRetention.js";

export default async function handler(req, res) {
  try {
    await cleanOldLogs();
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("CRON ERROR:", error);
    res.status(500).json({ success: false });
  }
}
