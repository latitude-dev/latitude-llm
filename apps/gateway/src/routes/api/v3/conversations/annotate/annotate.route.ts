import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { ROUTES } from '$/routes'
import { createRoute, z } from '@hono/zod-openapi'

export const annotateParamsSchema = z.object({
  conversationUuid: z.string().openapi({ description: 'Conversation UUID' }),
  evaluationUuid: z.string().openapi({ description: 'Evaluation UUID' }),
})

export const annotateRoute = createRoute({
  operationId: 'annotate',
  tags: ['Evaluations'],
  description: 'Annotate a conversation with an existing evaluation',
  method: http.Methods.POST,
  path: ROUTES.api.v3.conversations.annotate,
  request: {
    params: annotateParamsSchema,
    body: {
      content: {
        [http.MediaTypes.JSON]: {
          schema: z.object({
            score: z.number().openapi({ description: 'Score' }),
            versionUuid: z
              .string()
              .openapi({ description: 'Version UUID' })
              .optional(),
            metadata: z
              .object({
                reason: z
                  .string()
                  .openapi({ description: 'Reason for the score' }),
              })
              .optional(),
            context: z
              .object({
                messageIndex: z
                  .number()
                  .int()
                  .nonnegative()
                  .openapi({
                    description: 'Index of the message in the conversation',
                  }),
                contentBlockIndex: z
                  .number()
                  .int()
                  .nonnegative()
                  .openapi({
                    description: 'Index of the content block within the message',
                  }),
                contentType: z
                  .enum([
                    'text',
                    'reasoning',
                    'image',
                    'file',
                    'tool-call',
                    'tool-result',
                  ])
                  .openapi({ description: 'Type of the content block' }),
              })
              .optional()
              .openapi({
                description:
                  'Optional context to annotate a specific content block in the conversation',
              }),
          }),
        },
      },
    },
  },
  responses: {
    ...GENERIC_ERROR_RESPONSES,
    [http.Status.CREATED]: {
      description: 'Annotation was created successfully',
      content: {
        [http.MediaTypes.JSON]: {
          schema: z.object({
            uuid: z.string().openapi({ description: 'Annotation UUID' }),
            score: z.number().openapi({ description: 'Score' }),
            normalizedScore: z
              .number()
              .openapi({ description: 'Normalized score' }),
            metadata: z
              .object({
                reason: z
                  .string()
                  .openapi({ description: 'Reason for the score' }),
              })
              .optional(),
            hasPassed: z.boolean().openapi({ description: 'Has passed?' }),
            error: z.string().optional().openapi({ description: 'Error' }),
            versionUuid: z.string().openapi({ description: 'Version UUID' }),
          }),
        },
      },
    },
  },
})

export type AnnotateRoute = typeof annotateRoute
