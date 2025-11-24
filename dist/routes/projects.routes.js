// src/routes/projects.routes.ts
import { Router } from "express";
import { query } from "../db/postgreSQL.ts";
import { requireAuth } from "../middleware/auth.ts";
import { logger } from "../lib/logger.ts";
import { addProjectDetails, deleteProjectSql, updateProjectDetails } from "../db/query.js";
import { validate } from "../middleware/validate.ts";
import { projectSchema, projectUpdateSchema } from "../validation/project.ts";
import { uploadBuffer } from "../lib/upload.ts";
import cloudinary from "../lib/cloudinary.ts";
import { uploadMemory } from "../middleware/upload.ts";
import { formatZodError } from "../lib/zodError.ts";
import { diffObjects } from "../lib/diff.ts";
const router = Router();
/* ======================================================
   GET /projects  (Public)
====================================================== */
router.get("/", async (req, res) => {
    const start = Date.now();
    logger.info({ route: "GET /projects" }, "Projects list requested");
    try {
        const result = await query("SELECT * FROM projects WHERE profile_id = 1 ORDER BY created_at DESC");
        const duration = Date.now() - start;
        logger.info({
            route: "GET /projects",
            count: result.rows.length,
            durationMs: duration,
        }, "Projects fetched");
        return res.json(result.rows);
    }
    catch (err) {
        const duration = Date.now() - start;
        logger.error({ route: "GET /projects", error: err, durationMs: duration }, "Failed to fetch projects");
        return res.status(500).json({ message: "Server error" });
    }
});
/* ======================================================
   GET /projects/:id  (Public)
====================================================== */
router.get("/:id", async (req, res) => {
    const start = Date.now();
    logger.info({ route: "GET /projects" }, "Projects list requested");
    try {
        const result = await query("SELECT * FROM projects WHERE id = $1 ORDER BY created_at DESC", [req.params.id]);
        const duration = Date.now() - start;
        logger.info({
            route: "GET /projects/:id",
            count: result.rows.length,
            durationMs: duration,
        }, "Projects fetched");
        return res.json(result.rows[0]);
    }
    catch (err) {
        const duration = Date.now() - start;
        logger.error({ route: "GET /projects/:id", error: err, durationMs: duration }, "Failed to fetch projects");
        return res.status(500).json({ message: "Server error" });
    }
});
/* ======================================================
   POST /projects  (Admin only)
   - creates a new project
   - logs the event
   - writes an audit log (action=create)
====================================================== */
router.post("/", requireAuth, 
// multer runs first and populates req.body (text fields) and req.files (buffers)
uploadMemory.fields([{ name: "image", maxCount: 1 }, { name: "video", maxCount: 1 }]), validate(projectSchema), async (req, res) => {
    const admin = req.user;
    const start = Date.now();
    logger.info({ route: "POST /projects", adminId: admin?.userId }, "Create project requested");
    // 1) Parse + validate text fields (tools may be stringified in multipart)
    const raw = {
        name: req.body.name,
        tools: req.body.tools, // could be JSON string or comma string or array
        description: req.body.description,
        liveLink: req.body.liveLink ?? null,
        githubUrl: req.body.githubUrl ?? null,
        user_id: admin?.userId
    };
    const parsed = projectSchema.safeParse(raw);
    if (!parsed.success) {
        const formatted = formatZodError(parsed.error);
        logger.warn({ adminId: admin?.userId, fieldErrors: formatted.fieldErrors }, "Project validation failed");
        return res.status(400).json(formatted);
    }
    const body = parsed.data;
    // 2) Validate files (mime types, size checked by multer limits)
    const files = req.files;
    console.log(req.file);
    const imgFile = files?.image?.[0];
    const vidFile = files?.video?.[0];
    const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
    const allowedVideoTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"];
    if (imgFile && !allowedImageTypes.includes(imgFile.mimetype)) {
        logger.warn({ adminId: admin?.userId, mimetype: imgFile.mimetype }, "Invalid image type");
        return res.status(400).json({ message: "Invalid image type" });
    }
    if (vidFile && !allowedVideoTypes.includes(vidFile.mimetype)) {
        logger.warn({ adminId: admin?.userId, mimetype: vidFile.mimetype }, "Invalid video type");
        return res.status(400).json({ message: "Invalid video type" });
    }
    // 3) Upload files (with cleanup on failure)
    let imageSecureUrl = null;
    let imagePublicId = null;
    let videoSecureUrl = null;
    let videoPublicId = null;
    try {
        if (imgFile) {
            const folder = `${process.env.CLOUDINARY_FOLDER ?? "portfolio"}/projects/images`;
            const r = await uploadBuffer(imgFile.buffer, { folder, resource_type: "image", transformation: [{ width: 1400, crop: "limit" }] });
            imageSecureUrl = r.secure_url;
            imagePublicId = r.public_id;
            logger.info({ adminId: admin?.userId, imagePublicId }, "Image uploaded");
        }
        if (vidFile) {
            const folder = `${process.env.CLOUDINARY_FOLDER ?? "portfolio"}/projects/videos`;
            const r = await uploadBuffer(vidFile.buffer, { folder, resource_type: "video", chunk_size: 6000000 });
            videoSecureUrl = r.secure_url;
            videoPublicId = r.public_id;
            logger.info({ adminId: admin?.userId, videoPublicId }, "Video uploaded");
        }
    }
    catch (uploadErr) {
        logger.error({ adminId: admin?.userId, err: uploadErr }, "File upload failed, attempting cleanup");
        // cleanup any uploaded asset to avoid orphan
        if (imagePublicId) {
            try {
                await cloudinary.uploader.destroy(imagePublicId, { resource_type: "image" });
            }
            catch (cleanupErr) {
                logger.warn({ cleanupErr, imagePublicId }, "Failed to cleanup image");
            }
        }
        if (videoPublicId) {
            try {
                await cloudinary.uploader.destroy(videoPublicId, { resource_type: "video" });
            }
            catch (cleanupErr) {
                logger.warn({ cleanupErr, videoPublicId }, "Failed to cleanup video");
            }
        }
        return res.status(500).json({ message: "File upload failed" });
    }
    // 4) Insert into DB
    try {
        const result = await query(addProjectDetails, [
            body.name,
            body.tools || [],
            body.description,
            imageSecureUrl,
            imagePublicId,
            videoSecureUrl,
            videoPublicId,
            body.liveLink,
            body.githubUrl,
        ]);
        const newProject = result.rows[0];
        const duration = Date.now() - start;
        logger.info({ adminId: admin?.userId, projectId: newProject?.id, durationMs: duration }, "Project created");
        return res.status(201).json(newProject);
    }
    catch (dbErr) {
        logger.error({ adminId: admin?.userId, err: dbErr }, "DB insert failed, attempting cleanup of cloud assets");
        // rollback uploaded files if DB insert fails
        if (imagePublicId) {
            try {
                await cloudinary.uploader.destroy(imagePublicId, { resource_type: "image" });
            }
            catch (cleanupErr) {
                logger.warn({ cleanupErr, imagePublicId }, "Failed to cleanup image after DB error");
            }
        }
        if (videoPublicId) {
            try {
                await cloudinary.uploader.destroy(videoPublicId, { resource_type: "video" });
            }
            catch (cleanupErr) {
                logger.warn({ cleanupErr, videoPublicId }, "Failed to cleanup video after DB error");
            }
        }
        return res.status(500).json({ message: "Server error" });
    }
});
/* ========================
   PUT /projects/:id  (update)
   Accepts multipart with optional new image/video
   Will delete old Cloudinary assets when replaced
   ======================== */
router.put("/:id", requireAuth, uploadMemory.fields([{ name: "image", maxCount: 1 }, { name: "video", maxCount: 1 }]), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id))
        return res.status(400).json({ message: "Invalid project id" });
    const admin = req.user;
    const start = Date.now();
    logger.info({ route: "PUT /projects/:id", projectId: id, adminId: admin?.userId }, "Project update requested");
    try {
        // fetch existing project
        const oldRes = await query("SELECT * FROM projects WHERE id = $1", [id]);
        const old = oldRes.rows[0];
        if (!old)
            return res.status(404).json({ message: "Project not found" });
        // collect raw update fields (may be strings)
        const raw = {
            name: req.body.name,
            tools: req.body.tools,
            description: req.body.description,
            liveLink: req.body.liveLink ?? req.body.live_link ?? null,
            githubUrl: req.body.githubUrl ?? req.body.github_url ?? null,
        };
        // normalize tools
        if (typeof raw.tools === "string") {
            try {
                raw.tools = JSON.parse(raw.tools);
            }
            catch {
                raw.tools = raw.tools.split(",").map((s) => s.trim()).filter(Boolean);
            }
        }
        const parsed = projectUpdateSchema.safeParse(raw);
        if (!parsed.success) {
            const formatted = formatZodError(parsed.error);
            logger.warn({ adminId: admin?.userId, fieldErrors: formatted.fieldErrors }, "Project update validation failed");
            return res.status(400).json(formatted);
        }
        const body = parsed.data;
        // files
        const files = req.files;
        const imgFile = files?.image?.[0] ?? null;
        const vidFile = files?.video?.[0] ?? null;
        // upload new assets (if provided), record public ids to later cleanup old assets
        let newImageUrl = null;
        let newImagePublicId = null;
        let newVideoUrl = null;
        let newVideoPublicId = null;
        try {
            if (imgFile) {
                const folder = `${process.env.CLOUDINARY_FOLDER ?? "portfolio"}/projects/images`;
                const r = await uploadBuffer(imgFile.buffer, { folder, resource_type: "image", transformation: [{ width: 1400, crop: "limit" }] });
                newImageUrl = r.secure_url;
                newImagePublicId = r.public_id;
                logger.info({ adminId: admin?.userId, newImagePublicId }, "New image uploaded");
            }
            if (vidFile) {
                const folder = `${process.env.CLOUDINARY_FOLDER ?? "portfolio"}/projects/videos`;
                const r = await uploadBuffer(vidFile.buffer, { folder, resource_type: "video", chunk_size: 6000000 });
                newVideoUrl = r.secure_url;
                newVideoPublicId = r.public_id;
                logger.info({ adminId: admin?.userId, newVideoPublicId }, "New video uploaded");
            }
        }
        catch (uploadErr) {
            logger.error({ adminId: admin?.userId, err: uploadErr }, "File upload failed during update, attempting cleanup of new assets");
            if (newImagePublicId) {
                try {
                    await cloudinary.uploader.destroy(newImagePublicId, { resource_type: "image" });
                }
                catch (_) { }
            }
            if (newVideoPublicId) {
                try {
                    await cloudinary.uploader.destroy(newVideoPublicId, { resource_type: "video" });
                }
                catch (_) { }
            }
            return res.status(500).json({ message: "File upload failed" });
        }
        // perform update
        const result = await query(updateProjectDetails, [
            id,
            body.name ?? null,
            body.tools ?? null,
            body.description ?? null,
            newImageUrl ?? null,
            newImagePublicId ?? null,
            newVideoUrl ?? null,
            newVideoPublicId ?? null,
            body.liveLink ?? null,
            body.githubUrl ?? null,
        ]);
        const updated = result.rows[0];
        // cleanup old assets if new ones replaced them
        try {
            if (newImagePublicId && old.image_public_id) {
                await cloudinary.uploader.destroy(old.image_public_id, { resource_type: "image" });
                logger.info({ adminId: admin?.userId, publicId: old.image_public_id }, "Deleted old image from Cloudinary");
            }
            if (newVideoPublicId && old.video_public_id) {
                await cloudinary.uploader.destroy(old.video_public_id, { resource_type: "video" });
                logger.info({ adminId: admin?.userId, publicId: old.video_public_id }, "Deleted old video from Cloudinary");
            }
        }
        catch (cleanupErr) {
            logger.warn({ adminId: admin?.userId, cleanupErr }, "Failed to cleanup old cloud assets after update");
        }
        // audit diff
        try {
            const newForDiff = {
                name: updated.name,
                tools: updated.tools,
                description: updated.description,
                image_url: updated.image_url,
                image_public_id: updated.image_public_id,
                video_url: updated.video_url,
                video_public_id: updated.video_public_id,
                live_link: updated.live_link,
                github_url: updated.github_url,
            };
            const changes = diffObjects(old, newForDiff);
            logger.info({
                adminId: admin?.userId ?? null,
                action: "update",
                entity: "project",
                entityId: updated.id,
                changes,
                meta: { route: "PUT /projects/:id", durationMs: Date.now() - start, ip: req.ip },
            });
        }
        catch (auditErr) {
            logger.error({ adminId: admin?.userId, auditErr }, "Failed to write audit log for project update");
        }
        logger.info({ adminId: admin?.userId, projectId: updated.id, durationMs: Date.now() - start }, "Project updated");
        return res.json(updated);
    }
    catch (err) {
        logger.error({ err }, "Failed to update project");
        return res.status(500).json({ message: "Server error" });
    }
});
/* ========================
   DELETE /projects/:id
   Will delete DB row and cloud assets if present
   ======================== */
router.delete("/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id))
        return res.status(400).json({ message: "Invalid project id" });
    const admin = req.user;
    const start = Date.now();
    logger.info({ route: "DELETE /projects/:id", projectId: id, adminId: admin?.userId }, "Project delete requested");
    try {
        // fetch project to get public ids
        const fetch = await query("SELECT * FROM projects WHERE id = $1", [id]);
        const project = fetch.rows[0];
        if (!project)
            return res.status(404).json({ message: "Project not found" });
        // delete DB row (returning project)
        const del = await query(deleteProjectSql, [id]);
        const deleted = del.rows[0];
        // delete cloud assets (best-effort)
        try {
            if (project.image_public_id) {
                await cloudinary.uploader.destroy(project.image_public_id, { resource_type: "image" });
                logger.info({ adminId: admin?.userId, publicId: project.image_public_id }, "Deleted project image from Cloudinary");
            }
            if (project.video_public_id) {
                await cloudinary.uploader.destroy(project.video_public_id, { resource_type: "video" });
                logger.info({ adminId: admin?.userId, publicId: project.video_public_id }, "Deleted project video from Cloudinary");
            }
        }
        catch (cloudErr) {
            logger.warn({ adminId: admin?.userId, err: cloudErr }, "Failed to delete cloud assets for project (non-fatal)");
        }
        logger.info({ adminId: admin?.userId, projectId: id, durationMs: Date.now() - start }, "Project deleted");
        return res.json({ message: "Deleted", project: deleted });
    }
    catch (err) {
        logger.error({ err }, "Failed to delete project");
        return res.status(500).json({ message: "Server error" });
    }
});
export default router;
