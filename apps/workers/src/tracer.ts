import tracer from 'dd-trace'

if (process.env.DD_TRACING_ENABLED === 'true') {
  tracer.init({
    logInjection: true,
    runtimeMetrics: true,
  })
}

export default tracer
