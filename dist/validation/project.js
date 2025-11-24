// src/validation/project.ts
import { z } from "zod";
export const projectSchema = z.object({
    name: z.string().min(1).max(200),
    tools: z
        .union([z.string(), z.array(z.string().min(1))])
        .optional()
        .transform((val) => {
        if (!val)
            return [];
        if (typeof val === "string") {
            try {
                const parsed = JSON.parse(val);
                if (Array.isArray(parsed))
                    return parsed;
            }
            catch {
                // fallback: comma separated
                return val.split(",").map((s) => s.trim()).filter(Boolean);
            }
        }
        return val;
    }),
    description: z.string().min(1).max(2000),
    liveLink: z.string().url().optional().nullable(),
    githubUrl: z.string().url().optional().nullable(),
});
export const projectUpdateSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    tools: z
        .union([z.string(), z.array(z.string().min(1))])
        .optional()
        .transform((val) => {
        if (val === undefined)
            return undefined;
        if (Array.isArray(val))
            return val;
        if (typeof val === "string") {
            // try parse JSON
            try {
                const parsed = JSON.parse(val);
                if (Array.isArray(parsed))
                    return parsed;
            }
            catch {
                // fallback to comma separated
                return val.split(",").map((s) => s.trim()).filter(Boolean);
            }
        }
        return undefined;
    }),
    description: z.string().min(1).max(2000).optional(),
    // allow both names for ease of clients
    liveLink: z.string().url().optional().nullable(),
    live_link: z.string().url().optional().nullable(),
    githubUrl: z.string().url().optional().nullable(),
    github_url: z.string().url().optional().nullable(),
}).transform((obj) => {
    // normalize snake_case -> camelCase and prefer camelCase if both present
    const liveLink = obj.liveLink ?? obj.live_link ?? undefined;
    const githubUrl = obj.githubUrl ?? obj.github_url ?? undefined;
    const normalized = {
        ...obj,
        liveLink,
        githubUrl,
    };
    delete normalized.live_link;
    delete normalized.github_url;
    return normalized;
});
