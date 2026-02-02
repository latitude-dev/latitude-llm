export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { tracer } = await import('dd-trace')
  const { envClient } = await import('./envClient')

  const nodeEnv = envClient.NEXT_PUBLIC_NODE_ENV || 'development'
  const isDevelopment = nodeEnv === 'development'

  tracer.init({
    service: 'latitude-llm-web',
    env: nodeEnv,
    version: envClient.NEXT_PUBLIC_RELEASE_VERSION || '1.0.0',
    // LogInjection is not needed in development
    // Also generates MaxListenersExceededWarning due to the hot-reloading
    logInjection: !isDevelopment,
    runtimeMetrics: true,
  })

  tracer.use('http', {
    service: 'latitude-llm-web',
  })

  tracer.use('next', {
    service: 'latitude-llm-web',
  })

  // Configure ioredis plugin to skip tracing XREAD commands
  // to avoid generating millions of spans
  // from high-frequency polling
  tracer.use('ioredis', {
    blocklist: ['xread'],
  })
}
