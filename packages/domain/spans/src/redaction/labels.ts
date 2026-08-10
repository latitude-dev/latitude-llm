/** Placeholders are visible in the UI on purpose: users must be able to see why content is missing. */
export const redactionPlaceholder = (label: string): string => `[REDACTED_${label}]`

export const OVERSIZED_FIELD_PLACEHOLDER = "[REDACTED_OVERSIZED_FIELD]"

export const REDACTED_IDENTITY_PLACEHOLDER = "[REDACTED_USER]"

// UTF-16 code units, not bytes: `String.length` is exact and needs no encoding pass to size a leaf.
export const REDACTION_MAX_FIELD_CHARS = 1_000_000

// `JSON.parse` accepts nesting tens of thousands deep, well past what a recursive walk can survive.
export const REDACTION_MAX_DEPTH = 256

export const REDACTION_BATCH_TIMEOUT_MS = 30_000
