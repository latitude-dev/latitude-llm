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
  const activeSpan = tracer.scope().active()
  const span = activeSpan ?? tracer.startSpan('gateway.error')
  const causes = getErrorCauses(error)

  span.setTag('error', error)
  span.setTag('error.type', error.name)
  span.setTag('error.message', error.message)
  span.setTag('error.stack', error.stack)

  causes.forEach((cause, index) => {
    const prefix = `error.cause.${index}`
    span.setTag(`${prefix}.type`, cause.name)
    span.setTag(`${prefix}.message`, cause.message)
    span.setTag(`${prefix}.stack`, cause.stack)
  })

  if (causes.length > 0) {
    span.setTag(
      'error.cause.summary',
      causes.map((cause) => `${cause.name}: ${cause.message}`).join(' <- '),
    )
  }

  if (!activeSpan) span.finish()
}

function getErrorCauses(error: Error) {
  const causes: Error[] = []
  let cause = error.cause

  while (cause) {
    if (cause instanceof Error) {
      causes.push(cause)
      cause = cause.cause
      continue
    }

    causes.push(new Error(String(cause)))
    break
  }

  return causes
}
