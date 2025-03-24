import tracer from 'dd-trace'
import { env } from '@latitude-data/env'

tracer.init({
  logInjection: true,
  runtimeMetrics: true,
  env: env.NODE_ENV === 'production' ? 'prod' : 'dev',
  service: 'latitude-data/web',
})

export default tracer
