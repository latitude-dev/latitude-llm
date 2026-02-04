import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import {
  internalInfoSchema,
  chainEventDtoSchema,
  messageSchema,
  runBackgroundAPIResponseSchema,
  runSyncAPIResponseSchema,
} from '$/openApi/schemas'
import { ROUTES } from '$/routes'
import { createRoute, z } from '@hono/zod-openapi'
import { documentParamsSchema } from '../paramsSchema'

export const runRoute = createRoute({
  method: http.Methods.POST,
  path: ROUTES.api.v3.projects.documents.run,
  tags: ['Documents'],
  description: 'Run a prompt',
  request: {
    params: documentParamsSchema,
    body: {
      content: {
        [http.MediaTypes.JSON]: {
          schema: internalInfoSchema.extend({
            path: z.string(),
            stream: z.boolean().default(false),
            customIdentifier: z.string().optional(),
            parameters: z
              .record(z.string(), z.any())
              .optional()
              .default({})
              .openapi({
                type: 'object',
                additionalProperties: true,
                description: 'Document parameters as key-value pairs',
              }),
            tools: z.array(z.string()).optional().default([]),
            mcpHeaders: z
              .record(z.string(), z.record(z.string(), z.string()))
              .optional()
              .openapi({
                type: 'object',
                additionalProperties: {
                  type: 'object',
                  additionalProperties: { type: 'string' },
                },
                description:
                  'Custom headers to pass to MCP servers at runtime, keyed by integration name (e.g., { "myMcp": { "customer-id": "abc123" } })',
              }),
            userMessage: z
              .string()
              .optional()
              .describe(
                '@deprecated Use the `messages` parameter instead. This parameter will be removed in a future version.',
              ),
            messages: z
              .array(messageSchema)
              .optional()
              .describe(
                'Messages to append to the conversation after the compiled prompt. Note: This is not compatible with the <step> feature of PromptL.',
              ),
            background: z.boolean().optional(),
          }),
        },
      },
    },
  },
  responses: {
    ...GENERIC_ERROR_RESPONSES,
    [http.Status.OK]: {
      description:
        'If stream is true, returns a SSE stream. Otherwise, returns the final event as JSON. If background is true, enqueues the run and returns the job.',
      content: {
        [http.MediaTypes.JSON]: {
          schema: runSyncAPIResponseSchema.or(runBackgroundAPIResponseSchema),
        },
        [http.MediaTypes.SSE]: { schema: chainEventDtoSchema },
      },
    },
  },
})

export type RunRoute = typeof runRoute
