import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { ROUTES } from '$/routes'
import { createRoute, z } from '@hono/zod-openapi'
import { Otlp } from '@latitude-data/constants'

export const ingestRoute = createRoute({
  method: http.Methods.POST,
  path: ROUTES.api.v3.traces.ingest,
  tags: ['Traces'],
  description: 'Ingest OTLP spans (JSON or Protobuf)',
  request: {
    body: {
      content: {
        [http.MediaTypes.JSON]: { schema: Otlp.serviceRequestSchema },
        [http.MediaTypes.PROTOBUF]: {
          schema: z.instanceof(ArrayBuffer).openapi({
            type: 'string',
            format: 'binary',
            description: 'OTLP spans in Protobuf format',
          }),
        },
      },
    },
  },
  responses: {
    ...GENERIC_ERROR_RESPONSES,
    [http.Status.OK]: {
      description: 'Spans ingested successfully',
    },
  },
})

export type IngestRoute = typeof ingestRoute
