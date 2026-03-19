import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { defineRouteConfig } from '$/routes/api/helpers'
import { z } from '@hono/zod-openapi'

export const annotateParamsSchema = z.object({
  conversationUuid: z.string().openapi({ description: 'Conversation UUID' }),
  evaluationUuid: z.string().openapi({ description: 'Evaluation UUID' }),
})

export const annotateRouteConfig = defineRouteConfig({
  operationId: 'annotate',
  tags: ['Evaluations'],
  description: 'Annotate a conversation with an existing evaluation',
  method: http.Methods.POST,
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
                messageIndex: z.number().int().nonnegative().openapi({
                  description: 'Index of the message in the conversation',
                }),
                contentBlockIndex: z.number().int().nonnegative().openapi({
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
    [http.Status.ACCEPTED]: {
      description: 'Annotation request was accepted for processing',
      content: {
        [http.MediaTypes.JSON]: {
          schema: z.object({
            status: z
              .literal('accepted')
              .openapi({ description: 'Processing status' }),
            message: z
              .string()
              .openapi({ description: 'Queueing confirmation message' }),
            resultUuid: z
              .string()
              .openapi({ description: 'Annotation result UUID' }),
          }),
        },
      },
    },
  },
})

export type AnnotateRoute = typeof annotateRouteConfig
