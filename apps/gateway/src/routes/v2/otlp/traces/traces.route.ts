import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { ROUTES } from '$/routes'
import { createRoute, z } from '@hono/zod-openapi'
import { otlpTraceSchema } from './otlpTracesSchema'

export const tracesRoute = createRoute({
  operationId: 'createTelemetryTrace',
  method: http.Methods.POST,
  path: ROUTES.v2.telemetry.traces,
  tags: ['Telemetry'],
  request: {
    body: {
      content: {
        [http.MediaTypes.JSON]: {
          schema: otlpTraceSchema,
        },
      },
    },
  },
  responses: {
    ...GENERIC_ERROR_RESPONSES,
    [http.Status.OK]: {
      description: 'LLM call was successful traced',
      content: {
        [http.MediaTypes.JSON]: {
          schema: z.object({ status: z.literal('ok') }),
        },
      },
    },
  },
})

export type CreateTracesRoute = typeof tracesRoute
