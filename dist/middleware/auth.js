import jwt from "jsonwebtoken";
export const requireAuth = (req, res, next) => {
    // If you use cookie-parser at app level, cookies are available here.
    const token = 
    // try cookies first (if you set cookie from login)
    req.cookies?.portfolio_token ||
        // fallback to Authorization header: "Bearer <token>"
        req.headers.authorization?.split(" ")[1];
    if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.user = payload;
        next();
    }
    catch (err) {
        return res.status(401).json({ message: "Invalid token" });
    }
};
