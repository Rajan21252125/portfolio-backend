// src/routes/upload.routes.ts
import { Router } from "express";
import cloudinary from "../lib/cloudinary.js";
import { uploadMemory } from "../middleware/upload.js";
import { logger } from "../lib/logger.js";
const router = Router();
/**
 * POST /upload (server-side)
 * form-data: file=<file>
 */
router.post("/upload", uploadMemory.single("file"), async (req, res) => {
    try {
        if (!req.file)
            return res.status(400).json({ message: "No file" });
        // Basic MIME validation
        const allowed = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "video/quicktime"];
        if (!allowed.includes(req.file.mimetype)) {
            return res.status(400).json({ message: "Invalid file type" });
        }
        // Optional: define folder and resource_type based on mimetype
        const folder = `${process.env.CLOUDINARY_FOLDER || "portfolio"}/projects`;
        const resource_type = req.file.mimetype.startsWith("video") ? "video" : "image";
        // upload_stream wrapper
        const uploadStream = cloudinary.uploader.upload_stream({ folder, resource_type, chunk_size: 6000000 }, // chunk_size helpful for large video
        (error, result) => {
            if (error) {
                logger.error({ err: error }, "Cloudinary upload failed");
                return res.status(500).json({ message: "Upload failed" });
            }
            // result.secure_url, result.public_id, result.bytes, result.format, etc.
            return res.json({ url: result?.secure_url, public_id: result?.public_id, raw: result });
        });
        // pipe buffer to stream
        uploadStream.end(req.file.buffer);
    }
    catch (err) {
        logger.error({ err }, "Upload route failed");
        res.status(500).json({ message: "Server error" });
    }
});
export default router;
