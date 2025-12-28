// src/lib/diff.ts

import { logger } from "./logger.js";

/**
 * diffObjects(oldObj, newObj)
 * Returns an object mapping changed fields to { before, after }.
 * - Performs deep-ish equality by comparing JSON.stringify values for objects/arrays.
 * - Skips fields that are both undefined.
 * - For big objects you may want to limit keys or redact sensitive fields.
 */
export function diffObjects(oldObj: Record<string, any> = {}, newObj: Record<string, any> = {}) {
  const changes: Record<string, { before: any; after: any }> = {};
  const keys = new Set<string>([...Object.keys(oldObj), ...Object.keys(newObj)]);

  for (const key of keys) {
    const before = oldObj[key] === undefined ? null : oldObj[key];
    const after = newObj[key] === undefined ? null : newObj[key];

    // treat functions as unchanged
    if (typeof before === "function" || typeof after === "function") continue;

    // quick equality
    if (before === after) continue;

    // deep-ish equality for objects/arrays using JSON.stringify (deterministic enough)
    const isObjBefore = before !== null && typeof before === "object";
    const isObjAfter = after !== null && typeof after === "object";

    if (isObjBefore || isObjAfter) {
      try {
        const a = JSON.stringify(before);
        const b = JSON.stringify(after);
        if (a === b) continue;
      } catch {
        // fallthrough to record difference
      }
    }

    // record the change
    changes[key] = { before, after };
  }
  logger.debug({ changes }, "Computed object diff");
  return changes;
}
