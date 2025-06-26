import http from '$/common/http'
import { GENERIC_ERROR_RESPONSES } from '$/openApi/responses/errorResponses'
import { ROUTES } from '$/routes'
import { createRoute } from '@hono/zod-openapi'
import { Otlp } from '@latitude-data/core/browser'

export const ingestRoute = createRoute({
  method: http.Methods.POST,
  path: ROUTES.api.v3.traces.ingest,
  tags: ['Traces'],
  description: 'Ingest OTLP spans',
  request: {
    body: {
      content: {
        [http.MediaTypes.JSON]: { schema: Otlp.serviceRequestSchema },
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
