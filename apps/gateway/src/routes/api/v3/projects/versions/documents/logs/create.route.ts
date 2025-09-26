import http from '$/common/http'
import { LogSources, messageSchema } from '@latitude-data/core/browser'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { ROUTES } from '$/routes'
import { documentParamsSchema } from '$/routes/api/v2/documents/paramsSchema'
import { createRoute, z } from '@hono/zod-openapi'

const documentLogSchema = z.object({
  id: z.number(),
  uuid: z.string(),
  commitId: z.number(),
  resolvedContent: z.string(),
  contentHash: z.string(),
  parameters: z.record(z.string(), z.any()),
  customIdentifier: z.string().optional(),
  duration: z.number().optional(),
  source: z.enum(LogSources),
  createdAt: z.date(),
  updatedAt: z.date(),
})

function createLogRouteFactory({
  path,
  tags,
}: {
  path: string
  tags: string[]
}) {
  return createRoute({
    path,
    operationId: 'createDocumentLog',
    method: http.Methods.POST,
    description: 'Create a prompt log',
    tags,
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
}

export const createLogRouteV3 = createLogRouteFactory({
  path: ROUTES.api.v3.projects.documents.logs,
  tags: ['Logs'],
})

export type CreateLogRoute = typeof createLogRouteV3
