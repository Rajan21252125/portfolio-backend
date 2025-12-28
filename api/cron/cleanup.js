export default async function handler(req, res) {
  const auth = req.headers.authorization;

  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    await cleanOldLogs();
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("CRON ERROR:", error);
    res.status(500).json({ success: false });
  }
}
