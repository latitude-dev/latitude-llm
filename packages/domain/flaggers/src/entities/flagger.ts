import { cuidSchema, flaggerIdSchema } from "@domain/shared"
import { z } from "zod"
import { FLAGGER_STRATEGY_SLUGS, type FlaggerSlug } from "../flagger-strategies/types.ts"

const flaggerStrategySlugs = new Set<string>(FLAGGER_STRATEGY_SLUGS)
const flaggerSlugSchema: z.ZodType<FlaggerSlug> = z
  .string()
  .refine((slug): slug is FlaggerSlug => flaggerStrategySlugs.has(slug))

export const flaggerSchema = z.object({
  id: flaggerIdSchema,
  organizationId: cuidSchema,
  projectId: cuidSchema,
  slug: flaggerSlugSchema,
  enabled: z.boolean(),
  sampling: z.number().int().min(0).max(100),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Flagger = z.infer<typeof flaggerSchema>

export const FLAGGER_DEFAULT_ENABLED = true
