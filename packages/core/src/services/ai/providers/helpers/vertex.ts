import { z } from 'zod'

export const vertexConfigurationSchema = z.object({
  project: z.string(),
  location: z.string(),
  googleCredentials: z.object({
    clientEmail: z.string(),
    privateKey: z.string(),
    privateKeyId: z.string(),
  }),
})

export type VertexConfiguration = z.infer<typeof vertexConfigurationSchema>
