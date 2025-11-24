// src/middleware/upload.ts
import multer from "multer";
import { logger } from "../lib/logger.ts";
// Use memory storage so files are available as Buffer (req.file.buffer)
const storage = multer.memoryStorage();
/**
 * Limits:
 * - fileSize: maximum bytes per file (set to 100MB here — adjust as needed)
 * - files: maximum number of files total allowed for a single multipart request (optional)
 */
const upload = multer({
    storage,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100 MB per file max (tweak as needed)
        files: 5, // max files in a single request (optional)
    },
    fileFilter: (req, file, cb) => {
        // Allow images and common video types by default. If you want to restrict
        // images/videos separately, do that in the route handler.
        const allowed = [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "video/mp4",
            "video/webm",
            "video/mkv",
            "video/x-matroska",
            "application/pdf",
        ];
        logger.info(file, "file uploaded by a user");
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
        }
    },
});
/**
 * Exports:
 * - uploadMemory: base middleware (use .single, .array, .fields on it)
 * - helpers for common field setups
 */
export const uploadMemory = upload;
// helper: single file
export const singleUpload = (fieldName = "file") => uploadMemory.single(fieldName);
// helper: accept one image + one video (fields)
export const imageAndVideoFields = () => uploadMemory.fields([
    { name: "image", maxCount: 1 },
    { name: "video", maxCount: 1 },
]);
// helper: accept multiple images (e.g. gallery)
export const multipleImages = (max = 5) => uploadMemory.array("images", max);
