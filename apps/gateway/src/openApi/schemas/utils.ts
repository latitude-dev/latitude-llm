import { z } from '@hono/zod-openapi'
import { LogSources } from '@latitude-data/core/constants'

export const internalInfoSchema = z.object({
  __internal: z
    .object({
      source: z.enum(LogSources).optional(),
    })
    .optional(),
})
