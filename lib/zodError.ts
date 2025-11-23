// src/utils/zodError.ts
import type { ZodError } from "zod";

/**
 * Format ZodError into a consistent JSON structure for API responses.
 */
export function formatZodError(error: ZodError) {
  const flattened = error.flatten();

  return {
    message: "Validation error",
    formErrors: flattened.formErrors,     // array<string>
    fieldErrors: flattened.fieldErrors,   // Record<string, string[]>
  };
}
