import tracer from 'dd-trace'

tracer.init({
  logInjection: true,
  runtimeMetrics: true,
})

export default tracer
