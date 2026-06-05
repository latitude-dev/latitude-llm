import { z } from "zod"
import { TAXONOMY_DIMENSIONS } from "../constants.ts"

export const taxonomyDimensionSchema = z.enum(TAXONOMY_DIMENSIONS)
export type TaxonomyDimension = z.infer<typeof taxonomyDimensionSchema>

export const TaxonomyDimension = {
  Topic: "topic",
} as const satisfies Record<string, TaxonomyDimension>
