import { z } from 'zod'

export const experimentVariantSchema = z.object({
  name: z.string(),
  provider: z.string(),
  model: z.string(),
  temperature: z.number(),
})

export type ExperimentVariant = z.infer<typeof experimentVariantSchema>
