import type { Span, Tracer } from "@opentelemetry/api"
import { SpanStatusCode, trace } from "@opentelemetry/api"

export type { Span, Tracer }
export { trace, SpanStatusCode }

import { createLogger as createLoggerWithState } from "./logger.ts"
import { getObservabilityState } from "./state.ts"

export const createLogger = (scope: string) => createLoggerWithState(getObservabilityState(), scope)
