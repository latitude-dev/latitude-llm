import tracer from 'dd-trace'

tracer.init({
  apmTracingEnabled: process.env.DD_APM_ENABLED === 'true',
  service: 'latitude-llm-gateway',
  env: process.env.NODE_ENV,
})

export default tracer
