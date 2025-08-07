import { z } from '@hono/zod-openapi'

export const documentParamsSchema = z.object({
  projectId: z.string().openapi({ description: 'The project ID' }),
  versionUuid: z.string().openapi({ description: 'The version UUID or "live"' }),
})
