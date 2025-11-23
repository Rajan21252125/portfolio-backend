// src/validation/profile.ts
import { z } from "zod";

export const profileSchema = z.object({
  name: z.string().min(1).max(100),
  gmail: z.string().email(),
  about: z.string().min(10).max(5000),
  techStack: z.array(z.string()).max(50).optional(),
  skills: z.array(z.string()).max(100).optional(),
  roles: z.array(z.string()).max(20).optional(),
  urls: z.record(z.string(), z.string().url()),
});



/** Utility: convert string OR array OR JSON-string to array */
const arrayField = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((val) => {
    if (val === undefined) return undefined;

    // Already an array
    if (Array.isArray(val)) return val;

    // Try JSON parse if string
    if (typeof val === "string") {
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Fallback: comma-separated values
        return val.split(",").map((s) => s.trim()).filter(Boolean);
      }
    }

    return undefined;
  });

/** Utility: convert JSON-string or object to normalized object */
const objectField = z
  .union([z.string(), z.record(z.string(), z.string().url().or(z.string()))])
  .optional()
  .transform((val) => {
    if (val === undefined) return undefined;

    if (typeof val === "string") {
      try {
        const parsed = JSON.parse(val);
        return parsed && typeof parsed === "object" ? parsed : undefined;
      } catch {
        return undefined;
      }
    }

    return val;
  });

export const updateProfileSchema = z
  .object({
    // Direct fields
    name: z.string().min(1).max(200).optional(),
    gmail: z.string().email().optional(),
    about: z.string().min(1).max(3000).optional(),

    // tech stack (camelCase + snake_case)
    techStack: arrayField,
    tech_stack: arrayField,

    skills: arrayField,
    roles: arrayField,

    // URLs: JSON or string
    urls: objectField,
  })
  .transform((data) => {
    // Merge snake_case → camelCase
    return {
      name: data.name,
      gmail: data.gmail,
      about: data.about,

      techStack: data.techStack ?? data.tech_stack,
      skills: data.skills,
      roles: data.roles,
      urls: data.urls,
    };
  });