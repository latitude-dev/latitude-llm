import tracer from 'dd-trace'

tracer.init({
  service: 'latitude-llm-gateway',
  env: process.env.NODE_ENV,
})

export default tracer
