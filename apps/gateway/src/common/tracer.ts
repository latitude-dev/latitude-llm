import tracer from 'dd-trace'

tracer.init({
  profiling: process.env.NODE_ENV === 'production',
  apmTracingEnabled: process.env.NODE_ENV === 'production',
  service: 'latitude-llm-gateway',
  env: process.env.NODE_ENV,
})

// Configure ioredis plugin to skip tracing XREAD commands
// to avoid generating millions of spans from high-frequency polling
tracer.use('ioredis', {
  blocklist: ['xread'],
})

export default tracer

export function captureException(error: Error) {
  const span = tracer.scope().active()
  if (span) {
    span.setTag('error.type', error.name)
    span.setTag('error.message', error.message)
    span.setTag('error.stack', error.stack)
  }
}
