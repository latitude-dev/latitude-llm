import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { defineRouteConfig } from '$/routes/api/helpers'
import { z } from '@hono/zod-openapi'
import { Otlp } from '@latitude-data/constants'

export const ingestRouteConfig = defineRouteConfig({
  method: http.Methods.POST,
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

export type IngestRoute = typeof ingestRouteConfig
