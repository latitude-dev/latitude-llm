import tracer from 'dd-trace'
import { env } from '@latitude-data/env'

function getCauseAsError(cause: unknown) {
  const causeString = JSON.stringify(cause)
  return new Error(causeString)
}

export const captureException = (error: Error, tags?: Record<string, any>) => {
  if (env.NODE_ENV !== 'test') {
    console.error('Captured exception:', error)
  }

  if (error && 'cause' in error && error.cause) {
    captureException(getCauseAsError(error.cause), tags)
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
      service: 'latitude-web',
      ...tags,
    }),
  )
}

export const captureMessage = (
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
  tags?: Record<string, any>,
) => {
  if (env.NODE_ENV !== 'test') {
    console.log(`[${level}] ${message}`)
  }

  // Add message to the current span
  const span = tracer.scope().active()
  if (span) {
    span.log({
      event: level,
      message,
      ...tags,
    })
  }

  // Send to DataDog logs
  console.log(
    JSON.stringify({
      level,
      message,
      timestamp: new Date().toISOString(),
      service: 'latitude-web',
      ...tags,
    }),
  )
}
