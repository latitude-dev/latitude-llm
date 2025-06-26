import { createRouter } from '$/openApi/createApp'
import { ingestHandler } from './ingest/ingest.handler'
import { ingestRoute } from './ingest/ingest.route'

export const tracesRouter = createRouter().openapi(ingestRoute, ingestHandler)
