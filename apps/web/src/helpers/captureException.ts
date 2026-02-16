import tracer from 'dd-trace'
import { env } from '@latitude-data/env'

export const captureException = (error: Error, tags?: Record<string, any>) => {
  if (env.NODE_ENV !== 'test') {
    console.error('Captured exception:', error)
  }

  if ('cause' in error && error.cause) {
    captureException(error.cause as Error, tags)
    return
  }

  // Add error information to the current span
  const span = tracer.scope().active()
  if (span) {
    span.setTag('error', true)
    span.setTag('error.message', error.message)
    span.setTag('error.stack', error.stack)

    // Add custom tags if provided
    if (tags) {
      Object.entries(tags).forEach(([key, value]) => {
        span.setTag(key, value)
      })
    }

    span.log({
      event: 'error',
      'error.object': error,
      message: error.message,
      stack: error.stack,
      ...tags,
    })
  }

  // Send to DataDog logs
  console.error(
    JSON.stringify({
      level: 'error',
      message: error.message,
      error: error.name,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      service: 'latitude-llm-web',
      ...tags,
    }),
  )
}
