import tracer from 'dd-trace'

tracer.init({
  profiling: process.env.NODE_ENV === 'production',
  apmTracingEnabled: process.env.NODE_ENV === 'production',
  service: 'latitude-llm-gateway',
  env: process.env.NODE_ENV,
})

export default tracer
