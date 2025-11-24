// src/routes/profile.routes.ts
import { Router } from "express";
import type { Request, Response } from "express";

import { query } from "../db/postgreSQL.ts";
import { requireAuth } from "../middleware/auth.ts";
import { profileSchema, updateProfileSchema } from "../validation/profile.ts";
import { logger } from "../lib/logger.ts";
import { addProfileDetails, updateProfileDetails, updateProfileSql } from "../db/query.js";
import cloudinary, { uploadBuffer } from "../lib/cloudinary.ts";
import { uploadMemory } from "../middleware/upload.ts";
import { diffObjects } from "../lib/diff.ts";
import { formatZodError } from "../lib/zodError.ts";

const router = Router();

/* ======================================================
   GET /profile  (Public Route)
====================================================== */
router.get("/", async (req: Request, res: Response) => {
  logger.info("GET /profile request received");
  
  const start = Date.now();
  
  try {
    const result = await query( "SELECT * FROM profile WHERE user_id = 1 LIMIT 1");

    logger.info({
      duration: Date.now() - start + "ms",
      rows: result.rows.length,
    }, "Profile fetched successfully");

    return res.json(result.rows[0]);

  } catch (err) {
    logger.error({
      err,
      duration: Date.now() - start + "ms",
    }, "Failed to fetch profile");

    return res.status(500).json({ message: "Server error" });
  }
});


router.post(
  "/",
  requireAuth,
  uploadMemory.fields([
    { name: "profilePicture", maxCount: 1 },
    { name: "resume", maxCount: 1 }
  ]),
  async (req: Request, res: Response) => {
    const admin = (req as any).user;
    const start = Date.now();
    logger.info({ adminId: admin?.userId }, "Create profile request received");

    try {
      // 1) Check if profile already exists for this user
      const existsRes = await query("SELECT id FROM profile WHERE user_id = $1 LIMIT 1", [admin.userId]);
      if (existsRes.rows.length > 0) {
        logger.warn({ adminId: admin?.userId }, "Profile already exists for user");
        return res.status(409).json({ message: "Profile already exists" });
      }

      // 2) Collect & normalize text fields from req.body (multipart puts them as strings)
      const raw = {
        name: req.body.name,
        gmail: req.body.gmail,
        about: req.body.about,
        techStack: req.body.techStack,
        skills: req.body.skills,
        roles: req.body.roles,
        urls: req.body.urls, // expect JSON string or object
        profilePictureUrl: req.body.profilePictureUrl ?? null, // optional direct URL
      };

      // 3) Validate text fields using Zod schema (safeParse for friendly errors)
      const parsed = profileSchema.safeParse(raw);
      if (!parsed.success) {
        // use flatten to return field errors
        const flattened = parsed.error.flatten();
        logger.warn({ adminId: admin?.userId, fieldErrors: flattened.fieldErrors }, "Profile validation failed");
        return res.status(400).json({
          message: "Validation error",
          formErrors: flattened.formErrors,
          fieldErrors: flattened.fieldErrors,
        });
      }
      const data = parsed.data;

      // 3) Upload files if present
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const profileFile = files?.profilePicture?.[0];
      const resumeFile = files?.resume?.[0];

      // 4) Handle optional profilePicture file (upload to Cloudinary)
      let profilePictureUrl: string | null = null;
      let profilePicturePublicId: string | null = null;
      let resumeUrl: string | null = null;
      let resumePublicId: string | null = null;

      if (profileFile) {
        // validate mimetype (basic)
        const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
        if (!allowedImageTypes.includes(profileFile.mimetype)) {
          return res.status(400).json({ message: "Invalid profile picture type" });
        }

        try {
          const folder = `${process.env.CLOUDINARY_FOLDER ?? "portfolio"}/profiles`;
          const uploadRes: any = await uploadBuffer(profileFile.buffer, {
            folder,
            resource_type: "raw",
          });

          profilePictureUrl = uploadRes.secure_url;
          profilePicturePublicId = uploadRes.public_id;
          logger.info({ adminId: admin?.userId, publicId: profilePicturePublicId }, "Profile picture uploaded");
        } catch (err) {
          logger.error({ adminId: admin?.userId, err }, "Failed to upload profile picture");
          return res.status(500).json({ message: "Profile picture upload failed" });
        }
      }

      // resume upload (PDF) — store as raw
      if (resumeFile) {
        // basic mime check
        if (resumeFile.mimetype !== "application/pdf") {
          return res.status(400).json({ message: "Resume must be a PDF" });
        }
        try {
          const folder = `${process.env.CLOUDINARY_FOLDER ?? "portfolio"}/profiles/resumes`;
          const resCloud: any = await uploadBuffer(resumeFile.buffer, {
            folder,
            resource_type: "raw",
          });
          resumeUrl = resCloud.secure_url;
          resumePublicId = resCloud.public_id;
          logger.info({ adminId: admin?.userId, resumePublicId }, "Resume uploaded to Cloudinary (raw)");
        } catch (err) {
          // cleanup profile picture if already uploaded
          if (profilePicturePublicId) {
            try { await cloudinary.uploader.destroy(profilePicturePublicId, { resource_type: "image" }); } catch (_) {}
          }
          logger.error({ err, adminId: admin?.userId }, "Failed to upload resume");
          return res.status(500).json({ message: "Resume upload failed" });
        }
      }

      // 5) Insert new profile row
      const insertParams = [
        admin.userId,
        data.name,
        data.gmail,
        data.about,
        profilePictureUrl,
        data.techStack ?? [],
        data.skills ?? [],
        data.roles ?? [],
        data.urls ?? {},
        resumeUrl,
        resumePublicId,
      ];

      const result = await query(addProfileDetails, insertParams);
      const created = result.rows[0];

      logger.info({ adminId: admin?.userId, profileId: created.id, durationMs: Date.now() - start }, "Profile created");

      return res.status(201).json(created);
    } catch (err) {
      logger.error({ adminId: (req as any).user?.userId, err }, "Failed to create profile (server error)");

      // If DB failed and we earlier uploaded a picture, try to cleanup to avoid orphan asset
      // (We stored public id above only when upload succeeded)
      // Note: to keep code concise we skip tracking publicId here—if you want, store it in a variable scope and delete on error.

      return res.status(500).json({ message: "Server error" });
    }
  }
);

/* ============================
   PUT /profile  (update)
   Accepts: multipart/form-data (optional profilePicture) OR JSON
   ============================ */
router.put(
  "/",
  requireAuth,
  // allow optional single profilePicture; multer populates req.file and req.body
  uploadMemory.fields([
    { name: "profilePicture", maxCount: 1 },
    { name: "resume", maxCount: 1 }
  ]),
  async (req: Request, res: Response) => {
    const user = (req as any).user;
    const adminId = user?.userId ?? null;
    const start = Date.now();
    logger.info({ route: "PUT /profile", adminId, email: user?.email }, "Profile update requested");

    try {
      // 1) fetch existing profile for diff and to know old public_id
      const oldRes = await query("SELECT * FROM profile WHERE user_id = $1 LIMIT 1", [user.userId]);
      const oldProfile = oldRes.rows[0] ?? null;

      // 2) collect raw fields (multipart sends strings), normalize snake_case -> camelCase
      const raw: Record<string, any> = {
        name: req.body.name ?? undefined,
        gmail: req.body.gmail ?? undefined,
        about: req.body.about ?? undefined,
        techStack: req.body.techStack ?? req.body.tech_stack ?? undefined,
        skills: req.body.skills ?? undefined,
        roles: req.body.roles ?? undefined,
        urls: req.body.urls ?? undefined, // expect JSON string or object
      };

      // normalize tools/arrays if they are JSON strings or comma lists
      const normalizeArrayField = (v: any) => {
        if (v === undefined) return undefined;
        if (Array.isArray(v)) return v;
        if (typeof v === "string") {
          try {
            const parsed = JSON.parse(v);
            if (Array.isArray(parsed)) return parsed;
          } catch {
            return v.split(",").map((s: string) => s.trim()).filter(Boolean);
          }
        }
        return undefined;
      };

      raw.techStack = normalizeArrayField(raw.techStack);
      raw.skills = normalizeArrayField(raw.skills);
      raw.roles = normalizeArrayField(raw.roles);

      // parse urls if stringified JSON
      if (typeof raw.urls === "string") {
        try { raw.urls = JSON.parse(raw.urls); } catch { raw.urls = undefined; }
      }

      // 3) validate with Zod (multipart-safe)
      const parsed = updateProfileSchema.safeParse(raw);
      if (!parsed.success) {
        const formatted = formatZodError(parsed.error);
        logger.warn({ adminId, fieldErrors: formatted.fieldErrors }, "Profile validation failed");
        return res.status(400).json(formatted);
      }
      const body = parsed.data;

      // handle optional files
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const profileFile = files?.profilePicture?.[0] ?? null;
      const resumeFile = files?.resume?.[0] ?? null;

      let newProfilePictureUrl: string | null = null;
      let newProfilePicturePublicId: string | null = null;
      let newResumeUrl: string | null = null;
      let newResumePublicId: string | null = null;

      // upload profile picture if provided (same as before)
      if (profileFile) {
        const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
        if (!allowedImageTypes.includes(profileFile.mimetype)) {
          return res.status(400).json({ message: "Invalid profile picture type" });
        }
        try {
          const folder = `${process.env.CLOUDINARY_FOLDER ?? "portfolio"}/profiles`;
          const rc: any = await uploadBuffer(profileFile.buffer, { folder, resource_type: "image", transformation: [{ width: 800, crop: "limit" }] });
          newProfilePictureUrl = rc.secure_url;
          newProfilePicturePublicId = rc.public_id;
          logger.info({ adminId, newProfilePicturePublicId }, "New profile picture uploaded");
        } catch (err) {
          logger.error({ err, adminId }, "Failed to upload profile picture");
          return res.status(500).json({ message: "Profile picture upload failed" });
        }
      }

      // upload resume if provided (PDF)
      if (resumeFile) {
        if (resumeFile.mimetype !== "application/pdf") {
          return res.status(400).json({ message: "Resume must be a PDF" });
        }
        try {
          const folder = `${process.env.CLOUDINARY_FOLDER ?? "portfolio"}/profiles/resumes`;
          const rr: any = await uploadBuffer(resumeFile.buffer, { folder, resource_type: "raw" });
          newResumeUrl = rr.secure_url;
          newResumePublicId = rr.public_id;
          logger.info({ adminId, newResumePublicId }, "New resume uploaded");
        } catch (err) {
          // cleanup profile picture uploaded above (if any)
          if (newProfilePicturePublicId) {
            try { await cloudinary.uploader.destroy(newProfilePicturePublicId, { resource_type: "image" }); } catch (_) {}
          }
          logger.error({ err, adminId }, "Failed to upload resume");
          return res.status(500).json({ message: "Resume upload failed" });
        }
      }

      // 5) perform update (use COALESCE SQL so partial updates keep old values)
      const params = [
        user.userId,
        body.name ?? null,
        body.gmail ?? null,
        body.about ?? null,
        newProfilePictureUrl ?? null,
        body.techStack ?? null,
        body.skills ?? null,
        body.roles ?? null,
        body.urls ?? null,
        newResumeUrl ?? null,
        newResumePublicId ?? null,
      ];

      const result = await query(updateProfileSql, params);
      const updated = result.rows[0];

       // cleanup old assets if replaced
      try {
        if (newProfilePicturePublicId && oldProfile?.profile_picture_public_id) {
          await cloudinary.uploader.destroy(oldProfile.profile_picture_public_id, { resource_type: "image" });
          logger.info({ adminId, publicId: oldProfile.profile_picture_public_id }, "Deleted old profile picture");
        }
        if (newResumePublicId && oldProfile?.resume_public_id) {
          await cloudinary.uploader.destroy(oldProfile.resume_public_id, { resource_type: "raw" });
          logger.info({ adminId, publicId: oldProfile.resume_public_id }, "Deleted old resume from Cloudinary");
        }
      } catch (cleanupErr) {
        logger.warn({ adminId, cleanupErr }, "Failed to cleanup old cloud assets (non-fatal)");
      }

      // 7) compute diff and audit
      try {
        const newForDiff = {
          name: updated.name,
          gmail: updated.gmail,
          about: updated.about,
          profile_picture_url: updated.profile_picture_url,
          tech_stack: updated.tech_stack,
          skills: updated.skills,
          roles: updated.roles,
          urls: updated.urls,
        };
        const changes = oldProfile ? diffObjects(oldProfile, newForDiff) : { created: newForDiff };

        logger.info({
          adminId,
          action: oldProfile ? "update" : "create",
          entity: "profile",
          entityId: updated.id,
          changes,
          meta: {
            route: "PUT /profile",
            durationMs: Date.now() - start,
            ip: (req as any).ip,
            userAgent: req.get("user-agent") ?? null,
          },
        });
      } catch (auditErr) {
        logger.error({ adminId, auditErr }, "Failed to write audit log for profile update");
      }

      logger.info({
        adminId,
        durationMs: Date.now() - start,
        updatedFieldsSummary: {
          name: !!body.name,
          gmail: !!body.gmail,
          aboutLength: body.about ? body.about.length : undefined,
          techStackCount: body.techStack ? body.techStack.length : undefined,
        },
      }, "Profile updated successfully");

      return res.json(updated);
    } catch (err) {
      logger.error({ err, adminId }, "Failed to update profile");
      return res.status(500).json({ message: "Server error" });
    }
  }
);

/* ============================
   DELETE /profile  (delete logged-in user's profile)
   - deletes DB row and cloudinary asset (if present)
   ============================ */
router.delete("/", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const adminId = user?.userId ?? null;
  const start = Date.now();

  logger.info({ route: "DELETE /profile", adminId, email: user?.email }, "Profile delete requested");

  try {
    // fetch profile to get public_id and data for audit
    const fetch = await query("SELECT * FROM profile WHERE user_id = $1 LIMIT 1", [user.userId]);
    const profile = fetch.rows[0];
    if (!profile) {
      logger.warn({ adminId }, "Profile not found for delete");
      return res.status(404).json({ message: "Profile not found" });
    }

    // delete DB row (returning deleted row)
    const delRes = await query("DELETE FROM profile WHERE user_id = $1 RETURNING *;", [user.userId]);
    const deleted = delRes.rows[0];

    // delete cloudinary asset if public_id column exists (best effort)
    try {
      const publicId = profile.profile_picture_public_id ?? profile.profile_picture_publicid ?? null;
      if (publicId) {
        await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
        logger.info({ adminId, publicId }, "Deleted profile picture from Cloudinary");
      }
    } catch (cloudErr) {
      logger.warn({ adminId, cloudErr }, "Failed to delete profile picture from Cloudinary (non-fatal)");
    }

    try {
      // inside DELETE /profile handler cleanup block
      if (profile.resume_public_id) {
        await cloudinary.uploader.destroy(profile.resume_public_id, { resource_type: "raw" });
        logger.info({ adminId, publicId: profile.resume_public_id }, "Deleted resume from Cloudinary");
      }
    } catch (cloudErr) {
      logger.warn({ adminId, cloudErr }, "Failed to delete profile pdf from Cloudinary (non-fatal)");
    }

    logger.info({ adminId, durationMs: Date.now() - start }, "Profile deleted");
    return res.json({ message: "Profile deleted", profile: deleted });
  } catch (err) {
    logger.error({ err, adminId }, "Failed to delete profile");
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
