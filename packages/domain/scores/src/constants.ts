export const SCORE_SOURCES = ["evaluation", "annotation", "custom", "flagger"] as const

/**
 * Sentinel `sourceId` values accepted on annotation-source scores.
 *
 * - `UI`: created from the web app annotation tool.
 * - `API`: ingested via the public scores API.
 * - `SYSTEM`: legacy. No code path writes this anymore — flagger output now
 *   uses `source: "flagger"` with `sourceId = flagger.id`. Kept in the union
 *   so historical annotation score rows authored before that refactor still
 *   parse on read.
 */
export const ANNOTATION_SCORE_PARTIAL_SOURCE_IDS = ["UI", "API", "SYSTEM"] as const

export const SCORE_SOURCE_ID_MAX_LENGTH = 128

export const SCORE_PUBLICATION_DEBOUNCE = 5 * 60 * 1000
