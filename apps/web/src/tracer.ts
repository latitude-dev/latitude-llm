import tracer from 'dd-trace'
import { env } from '@latitude-data/env'

tracer.init({
  logInjection: true,
  runtimeMetrics: true,
  profiling: env.NODE_ENV === 'production',
  env: env.NODE_ENV === 'production' ? 'prod' : 'dev',
  service: 'latitude-data/web',
  version: '1.0.0',
})

export default tracer
