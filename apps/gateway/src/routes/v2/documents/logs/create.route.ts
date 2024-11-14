import http from '$/common/http'
import { messageSchema } from '@latitude-data/core/browser'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { ROUTES } from '$/routes'
import { documentParamsSchema } from '$/routes/v2/documents/paramsSchema'
import { createRoute, z } from '@hono/zod-openapi'
import { LogSources } from '@latitude-data/sdk'

const documentLogSchema = z.object({
  id: z.number(),
  uuid: z.string(),
  commitId: z.number(),
  resolvedContent: z.string(),
  contentHash: z.string(),
  parameters: z.record(z.any()),
  customIdentifier: z.string().optional(),
  duration: z.number().optional(),
  source: z.nativeEnum(LogSources),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const createLogRoute = createRoute({
  operationId: 'createDocumentLog',
  method: http.Methods.POST,
  path: ROUTES.v2.documents.logs,
  tags: ['Documents'],
  request: {
    params: documentParamsSchema,
    body: {
      content: {
        [http.MediaTypes.JSON]: {
          schema: z.object({
            path: z.string(),
            messages: z.array(messageSchema),
            response: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    ...GENERIC_ERROR_RESPONSES,
    [http.Status.OK]: {
      description: 'The document log was created successfully',
      content: {
        [http.MediaTypes.JSON]: { schema: documentLogSchema },
      },
    },
  },
})

export type CreateLogRoute = typeof createLogRoute
