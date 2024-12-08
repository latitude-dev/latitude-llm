import { Hono } from 'hono'

import { otlpTraceHandler } from './handlers/otlp'

const router = new Hono()

router.post('/v1/traces', ...otlpTraceHandler)

export { router as otlpTracesRouter }
