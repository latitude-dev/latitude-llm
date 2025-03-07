import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { ROUTES } from '$/routes'
import { conversationsParamsSchema } from '$/routes/api/v2/conversations/paramsSchema'
import { createRoute, z } from '@hono/zod-openapi'
import { EvaluationResultableType, LogSources } from '@latitude-data/constants'

export const evaluationResultSchema = z.object({
  id: z.string(),
  uuid: z.string(),
  evaluationUuid: z.string(),
  documentLogUuid: z.string(),
  evaluatedProviderLogUuid: z.number().optional(),
  evaluationProviderLogUuid: z.number().optional(),
  resultableType: z.nativeEnum(EvaluationResultableType).optional(),
  resultableId: z.number().optional(),
  source: z.nativeEnum(LogSources).optional(),
  reason: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  result: z.string().or(z.number()).or(z.boolean()).optional(),
})

function createEvaluationResultRouteFactory({
  path,
  tags,
}: {
  path: string
  tags: string[]
}) {
  return createRoute({
    operationId: 'createEvaluationResult',
    path,
    tags,
    method: http.Methods.POST,
    request: {
      params: conversationsParamsSchema.extend({
        evaluationUuid: z.string(),
      }),
      body: {
        content: {
          [http.MediaTypes.JSON]: {
            schema: z.object({
              result: z
                .number()
                .or(z.string())
                .or(z.boolean())
                .openapi({ description: 'The result of the evaluation' }),
              reason: z.string().optional().default('').openapi({
                description: 'The reason for the evaluation result',
              }),
            }),
          },
        },
      },
    },
    responses: {
      ...GENERIC_ERROR_RESPONSES,
      [http.Status.OK]: {
        description: 'Evaluations were executed successfully',
        content: {
          [http.MediaTypes.JSON]: {
            schema: evaluationResultSchema,
          },
        },
      },
    },
  })
}

export const createEvaluationResultV2Route = createEvaluationResultRouteFactory(
  {
    path: ROUTES.api.v2.conversations.createEvaluationResult,
    tags: ['V2_DEPRECATED'],
  },
)

export const createEvaluationResultV3Route = createEvaluationResultRouteFactory(
  {
    path: ROUTES.api.v3.conversations.createEvaluationResult,
    tags: ['Conversations'],
  },
)

export type CreateEvaluationResultRoute = typeof createEvaluationResultV3Route
