import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { messageSchema } from '$/openApi/schemas'
import { defineRouteConfig } from '$/routes/api/helpers'
import { z } from '@hono/zod-openapi'
import { LogSources } from '@latitude-data/core/constants'

const spanLogSchema = z.object({
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

export const createLogRouteConfig = defineRouteConfig({
  operationId: 'createDocumentLog',
  method: http.Methods.POST,
  description:
    'Create a prompt log. Deprecated: Use the traces ingest endpoint instead.',
  tags: ['Logs'],
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
        [http.MediaTypes.JSON]: { schema: spanLogSchema },
      },
    },
  },
})

export type CreateLogRoute = typeof createLogRouteConfig
