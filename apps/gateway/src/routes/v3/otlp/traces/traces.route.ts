import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { ROUTES } from '$/routes'
import { createRoute, z } from '@hono/zod-openapi'
import { otlpTraceSchema } from './otlpTracesSchema'

function tracesRouteFactory({ path, tags }: { path: string; tags: string[] }) {
  return createRoute({
    operationId: 'createTelemetryTrace',
    method: http.Methods.POST,
    path,
    tags,
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
}

export const tracesV2Route = tracesRouteFactory({
  path: ROUTES.v2.telemetry.traces,
  tags: ['V2_DEPRECATED'],
})

export const tracesV3Route = tracesRouteFactory({
  path: ROUTES.v3.telemetry.traces,
  tags: ['Telemetry'],
})

export type CreateTracesRoute = typeof tracesV3Route
