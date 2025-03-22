import tracer from 'dd-trace'
import { env } from '@latitude-data/env'

tracer.init({
  logInjection: true,
  runtimeMetrics: true,
  profiling: true,
})

export default tracer
