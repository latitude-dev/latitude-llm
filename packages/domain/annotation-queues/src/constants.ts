// ---------------------------------------------------------------------------
// Bulk import limits
// ---------------------------------------------------------------------------

/** Maximum number of traces that can be added to a queue in a single operation. */
export const MAX_TRACES_PER_QUEUE_IMPORT = 5_000

// ---------------------------------------------------------------------------
// Sampling defaults
// ---------------------------------------------------------------------------

/** Default sampling percentage for live queues when none is explicitly set. */
export const LIVE_QUEUE_DEFAULT_SAMPLING = 10

export const ANNOTATION_QUEUE_NAME_MAX_LENGTH = 128

// Slug length is centralized as `SLUG_MAX_LENGTH` in `@domain/shared/slug`
// — same cap (128) for every entity that has a user-derived slug.

// ---------------------------------------------------------------------------
// Hotkey bindings for the focused queue-review screen
// ---------------------------------------------------------------------------

export const QUEUE_REVIEW_HOTKEYS = {
  previousItem: "Shift+H",
  nextItem: "Shift+L",
  markComplete: "Mod+Enter",
  addToDataset: "Shift+D",
} as const
