export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { tracer } = await import('dd-trace')
    const { envClient } = await import('./envClient')

    tracer.init({
      service: 'latitude-llm-web',
      env: envClient.NEXT_PUBLIC_NODE_ENV || 'development',
      version: envClient.NEXT_PUBLIC_RELEASE_VERSION || '1.0.0',
      logInjection: true,
      runtimeMetrics: true,
    })

    tracer.use('http', {
      service: 'latitude-llm-web',
    })

    tracer.use('next', {
      service: 'latitude-llm-web',
    })
  }
}
