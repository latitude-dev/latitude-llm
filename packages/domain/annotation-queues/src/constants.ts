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

/** Slug can be slightly larger than name to accommodate URL-friendly transformations */
export const ANNOTATION_QUEUE_SLUG_MAX_LENGTH = 140

// ---------------------------------------------------------------------------
// Hotkey bindings for the focused queue-review screen
// ---------------------------------------------------------------------------

export const QUEUE_REVIEW_HOTKEYS = {
  previousItem: "Shift+H",
  nextItem: "Shift+L",
  markComplete: "Mod+Enter",
  addToDataset: "Shift+D",
} as const
