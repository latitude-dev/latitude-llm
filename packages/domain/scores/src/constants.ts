export const SCORE_SOURCES = ["evaluation", "annotation", "custom", "flagger"] as const

export const ANNOTATION_SCORE_PARTIAL_SOURCE_IDS = ["UI", "API", "SYSTEM"] as const

export const SCORE_SOURCE_ID_MAX_LENGTH = 128

export const SCORE_PUBLICATION_DEBOUNCE = 5 * 60 * 1000
