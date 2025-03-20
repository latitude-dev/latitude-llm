import { ParameterType } from '@latitude-data/constants'
import { z } from 'zod'

export const publishedDocumentDataSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  url: z.string(), // readonly
  canChat: z.boolean(),
})

export const createPublishedDocumentDataSchema =
  publishedDocumentDataSchema.omit({ url: true })

export const updatePublishedDocumentDataSchema =
  createPublishedDocumentDataSchema.partial()

export const documentDataSchema = z.object({
  uuid: z.string(), // readonly
  path: z.string(),
  type: z.enum(['prompt', 'agent']), // readonly
  config: z.object({}).passthrough(), // readonly
  content: z.string(),
  parameters: z.record(z.object({ type: z.nativeEnum(ParameterType) })), // readonly
  published: publishedDocumentDataSchema.or(z.literal(false)),
})

export const createDocumentDataSchema = documentDataSchema
  .omit({
    uuid: true,
    type: true,
    config: true,
    parameters: true,
    published: true,
  })
  .extend({
    published: createPublishedDocumentDataSchema.or(z.literal(false)),
  })

export const updateDocumentDataSchema = createDocumentDataSchema
  .omit({
    published: true,
  })
  .extend({
    published: updatePublishedDocumentDataSchema.or(z.literal(false)),
  })
  .partial()

export const documentListSchema = z.array(
  documentDataSchema.omit({ published: true, config: true, parameters: true }),
)

export type PublishedDocumentData = z.infer<typeof publishedDocumentDataSchema>
export type CreatePublishedDocumentData = z.infer<
  typeof createPublishedDocumentDataSchema
>
export type WritePublishedDocumentData = z.infer<
  typeof updatePublishedDocumentDataSchema
>

export type DocumentData = z.infer<typeof documentDataSchema>
export type CreateDocumentData = z.infer<typeof createDocumentDataSchema>
export type WriteDocumentData = z.infer<typeof updateDocumentDataSchema>

export type DocumentList = z.infer<typeof documentListSchema>
