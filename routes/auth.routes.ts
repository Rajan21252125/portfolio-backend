// src/routes/auth.routes.ts
import { Router } from "express";
import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { query } from "../db/postgreSQL.js";
import { logger } from "../lib/logger.js";
import { adminNotificationInsert, getOtpByEmail, getUserByEmail, insertOTP, signUpQuery } from "../db/query.js";
import { generateTokenHex, hashToken } from "../lib/token.js";
import { sendTemplatedEmail } from "../lib/emailTemplates.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

const router = Router();

// environment
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "grajan408@gmail.com";
const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES || 10);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);

/* ======================================================
   LOGIN — Step 1: verify password → send OTP
====================================================== */
router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;

  logger.info({ email }, "Login request received");

  try {
    if (!email || !password) {
      logger.warn({ email }, "Email or password missing");
      return res.status(400).json({ message: "Email and password required" });
    }

    // find user
    const result = await query(
      getUserByEmail,
      [email]
    );

    const user = result.rows[0];

    if (!user) {
      logger.warn({ email }, "Login failed: user not found");
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // verify password
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      logger.warn({ email }, "Login failed: incorrect password");
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!user.is_verified) {
      logger.warn({ email }, "Login failed: email not verified");
      return res.status(403).json({ message: "Email not verified. Please verify your email before logging in." });
    }

    if (!user.is_approved) {
      logger.warn({ email }, "Login failed: admin approval pending");
      return res.status(403).json({ message: "Admin approval pending. Please wait for approval before logging in." });
    }

    logger.info({ email, userId: user.id }, "Password verified");

    // generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await query(
      insertOTP,
      [email, otpHash, expiresAt]
    );

    logger.info({ email }, "OTP generated and stored in DB");

    try {
      await sendTemplatedEmail(
        "mailTemplates/user_password_email.html",
        { appName: process.env.APP_NAME || "server.portfolio", userName: email, otpOrCode: otp, codeTtl: OTP_TTL_MINUTES, supportEmail: process.env.SUPPORT_EMAIL },
        { to: email, subject: "Your login verification code" }
      );
      logger.info({ email }, "OTP email sent successfully");
    } catch (emailErr) {
      logger.error({ email, error: emailErr }, "OTP email send failed");
      return res.status(500).json({ message: "Failed to send OTP email" });
    }

    return res.json({ message: "OTP sent to your email" });

  } catch (err) {
    logger.error({ email, error: err }, "Login process failed");
    return res.status(500).json({ message: "Server error" });
  }
});

/* ======================================================
   VERIFY OTP — Step 2: verify OTP → login
====================================================== */
router.post("/verify-otp", async (req: Request, res: Response) => {
  const { email, otp } = req.body;

  logger.info({ email }, "OTP verification request received");

  try {
    if (!email || !otp) {
      logger.warn({ email }, "OTP or email missing");
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const otpRes = await query(
      getOtpByEmail,
      [email]
    );

    const record = otpRes.rows[0];
    const now = new Date();

    if (!record) {
      logger.warn({ email }, "No OTP record found for user");
      return res.status(400).json({ message: "No OTP found. Please request a new OTP." });
    }

    // expiry check
    if (new Date(record.expires_at) < now) {
      logger.warn({ email }, "OTP expired");
      return res.status(400).json({ message: "OTP expired. Request a new one." });
    }

    // attempts check
    if ((record.attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
      logger.warn({ email }, "OTP attempts exceeded limit");
      return res.status(429).json({ message: "Too many attempts. Request new OTP." });
    }

    const isValid = await bcrypt.compare(otp, record.otp_hash);

    if (!isValid) {
      logger.warn({ email }, "Invalid OTP entered");

      await query(
        `UPDATE login_otps SET attempts = COALESCE(attempts, 0) + 1 WHERE id = $1`,
        [record.id]
      );

      return res.status(401).json({ message: "Invalid OTP" });
    }

    logger.info({ email }, "OTP verified successfully");

    // fetch user
    const userRes = await query("SELECT id, email, is_admin FROM users WHERE email = $1", [email]);

    console.log("User records found:", userRes.rows );
    const user = userRes.rows[0];

    if (!user) {
      logger.error({ email }, "OTP verified but user not found in DB");
      return res.status(400).json({ message: "User not found" });
    }

    // create token
    const token = jwt.sign(
      { userId: user.id, email: user.email, isAdmin: user.is_admin },
      process.env.JWT_SECRET as string,
      { expiresIn: "1d" }
    );

    console.log("Generated JWT token for user:", token );

    // set cookie
    res.cookie("portfolio_token", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000,
    });

    logger.info({ email, userId: user.id }, "User logged in successfully");

    // delete used OTPs
    try {
      await query("DELETE FROM login_otps WHERE email = $1", [email]);
    } catch (error) {
      console.error("Failed to delete used OTPs:", error);
      logger.error({ email, error }, "Failed to delete used OTPs");
    }

    return res.json({ message: "Logged in" });

  } catch (err) {
    console.log("otp verification error:", err);
    logger.error(err, "OTP verification failed");
    return res.status(500).json({ message: "Server error" });
  }
});

/* ======================================================
   SIGN-UP 
====================================================== */
router.post("/sign-up", async (req: Request, res: Response) => {
  const { email, password } = req.body;

  logger.info({ email }, "Sign-up request received");

  try {
    if (!email || !password) {
      logger.warn({ email }, "Sign-up failed: missing email or password");
      return res.status(400).json({ message: "Email and password required" });
    }

    // check if exists
    const existing = await query("SELECT id FROM users WHERE email = $1", [email]);

    if (existing.rows.length > 0) {
      logger.warn({ email }, "Sign-up failed: already exists");
      return res.status(409).json({ message: "User already exists" });
    }

    logger.debug({ email }, "Creating new user account");

    const hashed = await bcrypt.hash(password, 10);
    const token = generateTokenHex(32);
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    const result = await query(
      signUpQuery,
      [email, hashed, tokenHash, expiresAt]
    );

    const newUser = result.rows[0];
    logger.info({ email, userId: newUser.id }, "User created successfully");


    // create admin notification row
    await query(
      adminNotificationInsert,
      [newUser.id, JSON.stringify({ email })]
    );


    // send verification mail to user
    const verifyUrl = `${process.env.APP_URL}/auth/verify-email?token=${token}&email=${encodeURIComponent(email)}`;

    try {
      await sendTemplatedEmail(
        "mailTemplates/user_verification_email.html",
        { appName: process.env.APP_NAME || "server.portfolio", userName: email, verifyUrl, tokenTtl: OTP_TTL_MINUTES, supportEmail: process.env.SUPPORT_EMAIL },
        { to: email, subject: "Verify your email address" }
      );
      logger.info({ email }, "Verification email sent to new user");
    } catch (sendErr) {
      logger.error(sendErr, "Failed sending verification email");
      // don't delete user; surface friendly error
      return res.status(500).json({ message: "Failed to send verification email" });
    }

    // optionally notify admin by email
    try {
      await sendTemplatedEmail(
        "mailTemplates/admin_notify_new_user.html",
        { appName: process.env.APP_NAME || "server.portfolio", userEmail: email, createdAt: new Date().toISOString(), supportEmail: process.env.SUPPORT_EMAIL },
        { to: ADMIN_EMAIL, subject: `New signup: ${email}` }
      );
    } catch (adminEmailErr) {
      logger.warn({ adminEmailErr }, "Failed to notify admin by email (non-fatal)");
    }

    logger.info({ email, userId: newUser.id }, "New user signed up and sign up process completed");

    return res.status(201).json({
      message: "Sign-up successful",
      user: newUser,
    });

  } catch (err) {
    console.log("Sign-up error:", err);
    logger.error({ email, error: err }, "Sign-up failed");
    return res.status(500).json({ message: "Internal server error" });
  }
});


// POST /auth/logout
router.post("/logout", async (req, res) => {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    logger.info("User logged out");

    return res.json({ message: "Logged out successfully" });
  } catch (err) {
    logger.error({ err }, "Logout failed");
    return res.status(500).json({ message: "Server error" });
  }
});



// src/routes/auth.routes.ts (add)
router.get("/verify-email", async (req: Request, res: Response) => {
  const { token, email } = req.query;
  if (!token || !email) {
    logger.warn({ token, email }, "Invalid verification link attempt");
    return res.status(400).send("Invalid verification link");
  }

  try {
    const tokenHash = hashToken(String(token));
    const row = await query(
      `SELECT id, verification_token_expires_at FROM users WHERE email = $1 AND verification_token = $2 LIMIT 1`,
      [String(email), tokenHash]
    );
    const user = row.rows[0];
    if (!user) {
      logger.warn({ email }, "Invalid or expired verification link used");
      return res.status(400).send("Invalid or expired verification link");
    }

    if (user.verification_token_expires_at && new Date(user.verification_token_expires_at) < new Date()) {
      logger.warn({ email }, "Expired verification link used");
      return res.status(400).send("Verification link expired. Please request a new one.");
    }

    // mark verified and clear token
    await query(`UPDATE users SET is_verified = TRUE, verification_token = NULL, verification_token_expires_at = NULL WHERE id = $1`, [user.id]);

    // (Optional) redirect to a confirmation page in frontend
    return res.send("Email verified. Wait for admin approval to be able to login.");
  } catch (err) {
    logger.error(err, "verify-email error");
    return res.status(500).send("Server error");
  }
});


/* ======================================================
   GET /auth/me
   Returns the currently authenticated user.
   Reads JWT from HTTP-only cookie.
====================================================== */
router.get("/me", async (req, res) => {
  console.log("Auth /me called", req.cookies );
  const token = req.cookies?.portfolio_token;
  console.log("Auth /me token:", token );

  if (!token) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);

    // decoded: { userId, email, iat, exp }
    const userId = (decoded as any).userId;

    const q = `
      SELECT id, email, is_admin, is_verified, is_approved
      FROM users
      WHERE id = $1
    `;
    const result = await query(q, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = result.rows[0];

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        is_admin: user.is_admin ?? false,
        is_verified: user.is_verified ?? false,
        is_approved: user.is_approved ?? false,
      },
    });
  } catch (err) {
    logger.warn({ err }, "Invalid or expired token in /auth/me");
    return res.status(401).json({ message: "Invalid or expired token" });
  }
});


/**
 * GET /admin/pending-users
 * Returns users who have verified their email but are not yet admin-approved.
 * Also returns how many unread admin_notifications exist (optional).
 */
router.get("/admin/pending-users", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const start = Date.now();
  try {
    // Fetch verified-but-not-approved users
    const usersRes = await query(
      `SELECT id, email, created_at, is_verified
       FROM users
       WHERE is_approved = FALSE
       ORDER BY created_at ASC`
    );

    const approvedRes = await query(
      `SELECT id, email, created_at
      FROM users
      WHERE is_verified = TRUE AND is_approved = TRUE AND is_admin = FALSE
      ORDER BY created_at DESC`
    );


    // Optionally fetch admin notifications (unread) to show extra context
    const notesRes = await query(
      `SELECT id, user_id, type, payload, read, created_at
       FROM admin_notifications
       WHERE read = FALSE
       ORDER BY created_at DESC
       LIMIT 50`
    );

    logger.info({ action: "list_pending_users", count: usersRes.rows.length, durationMs: Date.now() - start }, "Admin listed pending users");

    return res.json({
      pending: usersRes.rows,
      approved: approvedRes.rows,
      notifications: notesRes.rows,
    });
  } catch (err) {
    logger.error({ err, durationMs: Date.now() - start }, "Failed to fetch pending users");
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /admin/approve-user/:id
 * Approves a user (set is_approved = true), marks admin notifications related to that user as read,
 * sends an approval email to the user, and writes an audit log.
 */
router.post("/admin/approve-user/:id", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const admin = (req as any).user;
  const userId = Number(req.params.id);
  const start = Date.now();

  if (!userId || Number.isNaN(userId)) {
    return res.status(400).json({ message: "Invalid user id" });
  }

  try {
    // 1) Fetch user and ensure exists & can't re-approve
    const userRes = await query(`SELECT id, email, is_verified, is_approved FROM users WHERE id = $1 LIMIT 1`, [userId]);
    const user = userRes.rows[0];

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (!user.is_verified) {
      return res.status(400).json({ message: "User email not verified" });
    }
    if (user.is_approved) {
      return res.status(400).json({ message: "User is already approved" });
    }

    // 2) Update user to approved
    const updateRes = await query(`UPDATE users SET is_approved = TRUE, updated_at = NOW() WHERE id = $1 RETURNING id, email`, [userId]);
    const updatedUser = updateRes.rows[0];

    // 3) Mark related admin_notifications as read (non-destructive)
    try {
      await query(`UPDATE admin_notifications SET read = TRUE WHERE user_id = $1`, [userId]);
    } catch (noteErr) {
      logger.warn({ noteErr, userId }, "Failed to mark admin_notes read (non-fatal)");
    }

    // 4) Send approval email to the user (best-effort)
    try {
      const approveUrl = `${process.env.APP_URL ?? "http://localhost:5000"}/login`;

      await sendTemplatedEmail(
        "../mailTemplates/user_approved_email.html",
        {
          LOGO_PATH: "/mnt/data/8ffc2624-e0d1-4ac2-837a-29a0c7700757.png",
          USER_NAME: updatedUser.name ?? updatedUser.email,
          APPROVE_URL: approveUrl
        },
        {
          to: updatedUser.email,
          subject: "Your Account Has Been Approved"
        }
      );
      logger.info({ adminId: admin?.userId, userId, email: updatedUser.email }, "Sent approval email to user");
    } catch (emailErr) {
      logger.warn({ emailErr, userId }, "Failed to send approval email (non-fatal)");
    }

    logger.info({ adminId: admin?.userId, userId, durationMs: Date.now() - start }, "User approved successfully");

    return res.json({ message: "User approved", user: updatedUser });
  } catch (err) {
    logger.error({ err, adminId: admin?.userId, userId, durationMs: Date.now() - start }, "Failed to approve user");
    return res.status(500).json({ message: "Server error" });
  }
});



// ----------------------------------------
// RESEND EMAIL VERIFICATION (USER ACTION)
// ----------------------------------------
router.post("/resend-verification/:id", async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.id);

    if (!userId) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const userRes = await query(
      "SELECT id, email, is_verified FROM users WHERE id = $1",
      [userId]
    );

    const user = userRes.rows[0];

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.is_verified) {
      return res.status(400).json({ message: "Email already verified" });
    }

    // ---------------------------------------
    // create verification token
    // ---------------------------------------
    const token = generateTokenHex(32);
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    // delete older tokens for safety
    await query("DELETE FROM email_verification WHERE email = $1", [user.email]);

    // insert new verification entry
    await query(
      `INSERT INTO email_verification (email, token, expires_at)
       VALUES ($1, $2, $3)`,
      [user.email, token, expiresAt]
    );

    // generate verify URL
    const verifyUrl = `${process.env.APP_URL}/auth/verify-email?token=${token}&email=${encodeURIComponent(user.email)}`;

    // send email using template system
    try {
      await sendTemplatedEmail(
        "../mailTemplates/user_verification_email.html",
        {
          appName: process.env.APP_NAME || "portfolio.server",
          userName: user.email,
          verifyUrl,
          tokenTtl: 10,
          supportEmail: process.env.SUPPORT_EMAIL || "",
        },
        { to: user.email, subject: "Verify your email" }
      );
    } catch (err) {
      logger.error({ err }, "Failed to resend verification email");
      return res.status(500).json({ message: "Email send failed" });
    }

    logger.info({ email: user.email }, "Verification email resent");

    return res.json({ message: "Verification email resent successfully" });
  } catch (err) {
    logger.error({ err }, "Resend verification failed");
    return res.status(500).json({ message: "Internal server error" });
  }
});


router.get("/admin/stats", requireAuth, requireAdmin, async (req, res) => {
  try {
    const projects = await query("SELECT COUNT(*) FROM projects");
    const pendingUsers = await query("SELECT COUNT(*) FROM users WHERE is_approved=false");
    const approvedUsers = await query("SELECT COUNT(*) FROM users WHERE is_approved=true and is_admin=false");

    return res.json({
      totalProjects: Number(projects.rows[0].count),
      pendingUsers: Number(pendingUsers.rows[0].count),
      approvedUsers: Number(approvedUsers.rows[0].count),
    });

  } catch (err) {
    logger.error({ err }, "Failed to load dashboard stats");
    return res.status(500).json({ message: "Server error" });
  }
});




export default router;
