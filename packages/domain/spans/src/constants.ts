export const SESSION_ID_MAX_LENGTH = 128
export const TRACE_ID_LENGTH = 32
export const SPAN_ID_LENGTH = 16

/** Debounce window for trace end detection (5 minutes in milliseconds). */
export const TRACE_END_DEBOUNCE_MS = 5 * 60 * 1000
