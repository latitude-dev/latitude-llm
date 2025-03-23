import { env } from '@latitude-data/env'
import tracer from 'dd-trace'

if (process.env.DD_TRACING_ENABLED === 'true') {
  tracer.init({
    logInjection: true,
    runtimeMetrics: true,
    env: env.NODE_ENV === 'production' ? 'prod' : 'dev',
    profiling: true,
  })
}

export default tracer
