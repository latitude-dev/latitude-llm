import { Attributes } from '@opentelemetry/api'
import {
  ReadableSpan,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base'

import { AISemanticConventions } from './vercel/conventions'

export class VercelSpanProcessor extends SimpleSpanProcessor {
  computeOpenLLMAttributes(span: ReadableSpan) {
    return Object.values(AISemanticConventions).reduce(
      (openInferenceAttributes: Attributes, convention) => {
        /**
         *  Both settings and metadata are not full attribute paths but prefixes
         * @example ai.settings.<paramName> or ai.metadata.<metadataKey>
         */
        if (
          !(convention in span.attributes) &&
          convention !== AISemanticConventions.SETTINGS &&
          convention !== AISemanticConventions.METADATA
        ) {
          return openInferenceAttributes
        }

        const openInferenceKey = AISemConvToOISemConvMap[convention]

        switch (convention) {
          case AISemanticConventions.METADATA:
            return {
              ...openInferenceAttributes,
              ...safelyGetMetadataAttributes(span.attributes),
            }
          case AISemanticConventions.TOKEN_COUNT_COMPLETION:
          case AISemanticConventions.TOKEN_COUNT_PROMPT:
            // Do not capture token counts for non LLM spans to avoid double token counts
            if (span.kind !== OpenInferenceSpanKind.LLM) {
              return openInferenceAttributes
            }
            return {
              ...openInferenceAttributes,
              [openInferenceKey]: span.attributes[convention],
            }
          case AISemanticConventions.TOOL_CALL_ID:
            return {
              ...openInferenceAttributes,
              [openInferenceKey]: span.attributes[convention],
            }
          case AISemanticConventions.TOOL_CALL_NAME:
            return {
              ...openInferenceAttributes,
              [openInferenceKey]: span.attributes[convention],
            }
          case AISemanticConventions.TOOL_CALL_ARGS: {
            let argsAttributes = {
              [openInferenceKey]: span.attributes[convention],
            }
            // For tool spans, capture the arguments as input value
            if (span.kind === OpenInferenceSpanKind.TOOL) {
              argsAttributes = {
                ...argsAttributes,
                [SemanticConventions.INPUT_VALUE]: span.attributes[convention],
                [SemanticConventions.INPUT_MIME_TYPE]: getMimeTypeFromValue(
                  span.attributes[convention],
                ),
              }
            }
            return {
              ...openInferenceAttributes,
              ...argsAttributes,
            }
          }
          case AISemanticConventions.TOOL_CALL_RESULT:
            // For tool spans, capture the result as output value, for non tool spans ignore
            if (span.kind !== OpenInferenceSpanKind.TOOL) {
              return openInferenceAttributes
            }
            return {
              ...openInferenceAttributes,
              [openInferenceKey]: span.attributes[convention],
              [SemanticConventions.OUTPUT_MIME_TYPE]: getMimeTypeFromValue(
                span.attributes[convention],
              ),
            }
          case AISemanticConventions.MODEL_ID: {
            const modelSemanticConvention =
              span.kind === OpenInferenceSpanKind.EMBEDDING
                ? SemanticConventions.EMBEDDING_MODEL_NAME
                : SemanticConventions.LLM_MODEL_NAME
            return {
              ...openInferenceAttributes,
              [modelSemanticConvention]: span.attributes[convention],
            }
          }
          case AISemanticConventions.SETTINGS:
            return {
              ...openInferenceAttributes,
              ...safelyGetInvocationParamAttributes(span.attributes),
            }
          case AISemanticConventions.PROMPT:
          case AISemanticConventions.RESULT_OBJECT:
          case AISemanticConventions.RESULT_TEXT: {
            return {
              ...openInferenceAttributes,
              ...safelyGetIOValueAttributes({
                attributeValue: span.attributes[convention],
                OpenInferenceSemanticConventionKey:
                  openInferenceKey as OpenInferenceIOConventionKey,
              }),
            }
          }
          case AISemanticConventions.RESULT_TOOL_CALLS:
            return {
              ...openInferenceAttributes,
              ...safelyGetToolCallMessageAttributes(
                span.attributes[convention],
              ),
            }
          case AISemanticConventions.PROMPT_MESSAGES:
            return {
              ...openInferenceAttributes,
              ...safelyGetInputMessageAttributes(span.attributes[convention]),
            }
            break
          case AISemanticConventions.EMBEDDING_TEXT:
          case AISemanticConventions.EMBEDDING_TEXTS:
          case AISemanticConventions.EMBEDDING_VECTOR:
          case AISemanticConventions.EMBEDDING_VECTORS:
            return {
              ...openInferenceAttributes,
              ...safelyGetEmbeddingAttributes({
                attributeValue: span.attributes[convention],
                OpenInferenceSemanticConventionKey: openInferenceKey,
              }),
            }
          default:
            return assertUnreachable(convention)
        }
      },
      openInferenceAttributes,
    )
  }

  onEnd(span: ReadableSpan): void {
    const attributes = { ...span.attributes }

    try {
      ;(span as any).attributes = {
        ...span.attributes,
        ...this.computeOpenLLMAttributes(span),
      }
    } catch (e) {
      // do nothing
    }
  }
}
