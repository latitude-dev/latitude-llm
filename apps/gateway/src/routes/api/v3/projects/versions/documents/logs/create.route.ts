import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { messageSchema } from '$/openApi/schemas'
import { ROUTES } from '$/routes'
import { createRoute, z } from '@hono/zod-openapi'
import { LogSources } from '@latitude-data/core/constants'

const documentLogSchema = z.object({
  id: z.number(),
  uuid: z.string(),
  commitId: z.number(),
  resolvedContent: z.string(),
  contentHash: z.string(),
  parameters: z.record(z.string(), z.any()).openapi({
    type: 'object',
    additionalProperties: true,
    description: 'Document parameters as key-value pairs',
  }),
  customIdentifier: z.string().optional(),
  duration: z.number().optional(),
  source: z.enum(LogSources),
  createdAt: z.date().openapi({ type: 'string', format: 'date-time' }),
  updatedAt: z.date().openapi({ type: 'string', format: 'date-time' }),
})

const documentParamsSchema = z.object({
  projectId: z.string().openapi({ description: 'The project ID' }),
  versionUuid: z
    .string()
    .openapi({ description: 'The version UUID or "live"' }),
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
