import {
  CENTROID_EMBEDDING_DIMENSIONS,
  CENTROID_EMBEDDING_MODEL,
  CENTROID_HALF_LIFE_SECONDS,
  CENTROID_SOURCE_WEIGHTS,
} from "./constants.ts"
import type { IssueCentroid } from "./entities/issue.ts"

/**
 * Create an empty centroid with default config values.
 * Used when creating a brand-new issue before any evidence has been contributed.
 */
export const emptyIssueCentroid = (): IssueCentroid => ({
  base: new Array<number>(CENTROID_EMBEDDING_DIMENSIONS).fill(0),
  mass: 0,
  model: CENTROID_EMBEDDING_MODEL,
  decay: CENTROID_HALF_LIFE_SECONDS,
  weights: { ...CENTROID_SOURCE_WEIGHTS },
})
