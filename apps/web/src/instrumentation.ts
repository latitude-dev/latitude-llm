import tracer from 'dd-trace'
import { env } from '@latitude-data/env'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    tracer.init({
      service: 'latitude-web',
      env: env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      logInjection: true,
      runtimeMetrics: true,
    })

    await tracer.use('http', {
      service: 'latitude-web-http',
    })

    await tracer.use('next', {
      service: 'latitude-web-next',
    })
  }
}

export const onRequestError = (error: Error, request: any) => {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const span = tracer.scope().active()
    if (span) {
      span.setTag('error', true)
      span.setTag('error.message', error.message)
      span.setTag('error.stack', error.stack)
      span.log({
        event: 'error',
        'error.object': error,
        message: error.message,
        stack: error.stack,
      })
    }
  }
  console.error('Request error:', error)
}
