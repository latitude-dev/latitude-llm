import * as otel from '@opentelemetry/api'
import {
  ReadableSpan,
  Span,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-node'

/**
 * Maps Vercel AI SDK operation IDs to standard GenAI operation names
 */
const OPERATION_ID_MAPPINGS: Record<string, string> = {
  'ai.generateText': 'chat',
  'ai.generateText.doGenerate': 'chat',
  'ai.streamText': 'chat',
  'ai.streamText.doStream': 'chat',
  'ai.generateObject': 'chat',
  'ai.generateObject.doGenerate': 'chat',
  'ai.streamObject': 'chat',
  'ai.streamObject.doStream': 'chat',
  'ai.embed': 'embeddings',
  'ai.embedMany': 'embeddings',
  'ai.toolCall': 'execute_tool',
}

/**
 * Maps operation IDs to Latitude span types
 */
const OPERATION_TO_LATITUDE_TYPE: Record<string, string> = {
  'ai.generateText': 'completion',
  'ai.generateText.doGenerate': 'completion',
  'ai.streamText': 'completion',
  'ai.streamText.doStream': 'completion',
  'ai.generateObject': 'completion',
  'ai.generateObject.doGenerate': 'completion',
  'ai.streamObject': 'completion',
  'ai.streamObject.doStream': 'completion',
  'ai.embed': 'embedding',
  'ai.embedMany': 'embedding',
  'ai.toolCall': 'tool',
}

/**
 * A SpanProcessor that normalizes Vercel AI SDK telemetry to standard
 * OpenTelemetry GenAI semantic conventions.
 *
 * This ensures a consistent experience regardless of which SDK generated the spans.
 */
export class NormalizingSpanProcessor implements SpanProcessor {
  onStart(span: Span, _parentContext: otel.Context): void {
    // We normalize on start so baggage and other processors can work with normalized attributes
    const operationId = span.attributes['ai.operationId'] as string | undefined

    if (!operationId) {
      // Not a Vercel AI SDK span, skip normalization
      return
    }

    // Map the operation ID to standard gen_ai.operation.name
    const normalizedOperation = OPERATION_ID_MAPPINGS[operationId]
    if (normalizedOperation) {
      span.setAttribute('gen_ai.operation.name', normalizedOperation)
    }

    // Set latitude.type if not already set
    if (!span.attributes['latitude.type']) {
      const latitudeType = OPERATION_TO_LATITUDE_TYPE[operationId]
      if (latitudeType) {
        span.setAttribute('latitude.type', latitudeType)
      }
    }
  }

  onEnd(_span: ReadableSpan): void {
    // Note: ReadableSpan attributes are immutable, so we do normalization on start
    // If we need to normalize based on final attributes, we'd need a different approach
  }

  forceFlush(): Promise<void> {
    return Promise.resolve()
  }

  shutdown(): Promise<void> {
    return Promise.resolve()
  }
}
