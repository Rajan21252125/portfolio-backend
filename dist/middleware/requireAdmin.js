export function requireAdmin(req, res, next) {
    const user = req.user;
    console.log("requireAdmin middleware invoked. User:", user);
    if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
    }
    if (!user.isAdmin) {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
    }
    next();
}
