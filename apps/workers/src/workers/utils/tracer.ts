import tracer from 'dd-trace'

tracer.init({
  apmTracingEnabled: process.env.DD_APM_ENABLED === 'true',
  service: 'latitude-llm-workers',
  env: process.env.NODE_ENV,
})

// Configure ioredis plugin to skip tracing XREAD commands
// to avoid generating millions of spans from high-frequency polling
tracer.use('ioredis', {
  blocklist: ['xread'],
})

export default tracer
