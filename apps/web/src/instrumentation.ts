export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { tracer } = await import('dd-trace')
    const { envClient } = await import('./envClient')

    tracer.init({
      service: 'latitude-web',
      env: envClient.NEXT_PUBLIC_NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      logInjection: true,
      runtimeMetrics: true,
    })

    tracer.use('http', {
      service: 'latitude-web-http',
    })

    tracer.use('next', {
      service: 'latitude-web-next',
    })
  }
}
