/**
 * Format ZodError into a consistent JSON structure for API responses.
 */
export function formatZodError(error) {
    const flattened = error.flatten();
    return {
        message: "Validation error",
        formErrors: flattened.formErrors, // array<string>
        fieldErrors: flattened.fieldErrors, // Record<string, string[]>
    };
}
