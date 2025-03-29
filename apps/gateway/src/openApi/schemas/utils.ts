import { z } from '@hono/zod-openapi'
import { LogSources } from '@latitude-data/core'

export const internalInfoSchema = z.object({
  __internal: z
    .object({
      source: z.nativeEnum(LogSources).optional(),
    })
    .optional(),
})
