import { Hono } from 'hono'

import { otlpTraceHandler } from './handlers/otlp'

const router = new Hono()

// Standard OTLP endpoint for traces
router.post('/v1/traces', ...otlpTraceHandler)

export { router as otlpTracesRouter }
