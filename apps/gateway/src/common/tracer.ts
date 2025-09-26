import tracer from 'dd-trace'

tracer.init({
  profiling: process.env.NODE_ENV === 'production',
  apmTracingEnabled: process.env.NODE_ENV === 'production',
  service: 'latitude-llm-gateway',
  env: process.env.NODE_ENV,
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
