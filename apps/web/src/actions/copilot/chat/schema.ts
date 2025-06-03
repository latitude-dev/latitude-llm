import { z } from 'zod'

export const latteContextSchema = z.object({
  path: z.string(),

  projectId: z.number().optional(),
  commitUuid: z.string().optional(),
  documentUuid: z.string().optional(),
  evaluationUuid: z.string().optional(),
})
