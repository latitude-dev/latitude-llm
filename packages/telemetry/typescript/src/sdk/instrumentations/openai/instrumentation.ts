/**
 * Augments traceloop's `@traceloop/instrumentation-openai` with the OpenAI
 * Responses API (`client.responses.create`), which traceloop's JS package does
 * not yet patch. Mirrors the attribute conventions of the upstream Python
 * `responses_wrappers.py`, so spans match what traceloop emits server-side.
 *
 * Once openllmetry-js ports their Python Responses support, this subclass
 * should be deleted and the openai entry should switch back to the upstream
 * `OpenAIInstrumentation` directly.
 */

import { type Attributes, context, type Span, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api"
import {
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_TOP_P,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_ID,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
} from "@opentelemetry/semantic-conventions/incubating"
import { OpenAIInstrumentation } from "@traceloop/instrumentation-openai"
import { buildInputMessages, buildOutputMessages, deriveFinishReason, type ResponseObject } from "./messages.ts"

export type { ResponseObject } from "./messages.ts"

export interface ResponsesParams {
  model?: string
  input?: string | unknown[]
  instructions?: string
  max_output_tokens?: number
  temperature?: number
  top_p?: number
  stream?: boolean
}

type ResponsesCreateMethod = (this: unknown, ...args: unknown[]) => unknown

const SPAN_NAME_PREFIX = "openai.response"

/**
 * Drop-in replacement for `OpenAIInstrumentation` that also patches the
 * Responses API on top of upstream Chat/Completions/Images coverage.
 */
export class OpenAIInstrumentationWithResponses extends OpenAIInstrumentation {
  override manuallyInstrument(module: unknown): void {
    super.manuallyInstrument(module)

    const responsesProto = (module as { Responses?: { prototype?: object } })?.Responses?.prototype
    if (!responsesProto) return

    const wrap = (
      this as unknown as {
        _wrap: (
          target: object,
          name: string,
          factory: (original: ResponsesCreateMethod) => ResponsesCreateMethod,
        ) => void
      }
    )._wrap
    wrap.call(this, responsesProto, "create", this.patchResponses())
  }

  private patchResponses(): (original: ResponsesCreateMethod) => ResponsesCreateMethod {
    // Capture `this` so we read `.tracer` at call time. InstrumentationBase
    // reassigns its tracer when `setTracerProvider` runs (after manuallyInstrument),
    // so a value captured here would point at the pre-registration default.
    const plugin = this as unknown as { tracer: ReturnType<typeof trace.getTracer> }
    return (original) =>
      function patched(this: unknown, ...args: unknown[]) {
        const params = (args[0] ?? {}) as ResponsesParams
        const span = plugin.tracer.startSpan(`${SPAN_NAME_PREFIX} ${params.model ?? "openai"}`, {
          kind: SpanKind.CLIENT,
          attributes: buildRequestAttributes(params),
        })
        const ctx = trace.setSpan(context.active(), span)

        return context.with(ctx, () => {
          let raw: unknown
          try {
            raw = original.apply(this, args)
          } catch (err) {
            recordError(span, err)
            span.end()
            throw err
          }

          const promise = raw as PromiseLike<unknown>
          if (params.stream) {
            return Promise.resolve(promise).then(
              (stream) => wrapStream(span, stream as AsyncIterable<unknown>),
              (err) => {
                recordError(span, err)
                span.end()
                throw err
              },
            )
          }

          return Promise.resolve(promise).then(
            (response) => {
              applyResponseAttributes(span, response as ResponseObject)
              span.end()
              return response
            },
            (err) => {
              recordError(span, err)
              span.end()
              throw err
            },
          )
        })
      }
  }
}

export function buildRequestAttributes(params: ResponsesParams): Attributes {
  const attrs: Attributes = {
    [ATTR_GEN_AI_OPERATION_NAME]: "chat",
    [ATTR_GEN_AI_PROVIDER_NAME]: "openai",
  }
  if (params.model) attrs[ATTR_GEN_AI_REQUEST_MODEL] = params.model
  if (params.max_output_tokens !== undefined) {
    attrs[ATTR_GEN_AI_REQUEST_MAX_TOKENS] = params.max_output_tokens
  }
  if (params.temperature !== undefined) {
    attrs[ATTR_GEN_AI_REQUEST_TEMPERATURE] = params.temperature
  }
  if (params.top_p !== undefined) {
    attrs[ATTR_GEN_AI_REQUEST_TOP_P] = params.top_p
  }
  attrs[ATTR_GEN_AI_INPUT_MESSAGES] = JSON.stringify(buildInputMessages(params))
  return attrs
}

export function applyResponseAttributes(span: Span, response: ResponseObject): void {
  if (!response || typeof response !== "object") return
  if (response.id) span.setAttribute(ATTR_GEN_AI_RESPONSE_ID, response.id)
  if (response.model) span.setAttribute(ATTR_GEN_AI_RESPONSE_MODEL, response.model)

  const usage = response.usage
  if (usage) {
    if (typeof usage.input_tokens === "number") {
      span.setAttribute(ATTR_GEN_AI_USAGE_INPUT_TOKENS, usage.input_tokens)
    }
    if (typeof usage.output_tokens === "number") {
      span.setAttribute(ATTR_GEN_AI_USAGE_OUTPUT_TOKENS, usage.output_tokens)
    }
  }

  const finish = deriveFinishReason(response)
  if (finish) span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, [finish])

  span.setAttribute(ATTR_GEN_AI_OUTPUT_MESSAGES, JSON.stringify(buildOutputMessages(response)))
}

function recordError(span: Span, err: unknown): void {
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: err instanceof Error ? err.message : String(err),
  })
  if (err instanceof Error) span.recordException(err)
}

/**
 * Wrap an async iterable so we can capture the final `response.completed`
 * payload (which carries usage and finalised output) before ending the span,
 * while still forwarding every chunk to the caller transparently.
 */
async function* wrapStream(span: Span, stream: AsyncIterable<unknown>): AsyncGenerator<unknown, void, unknown> {
  let finalResponse: ResponseObject | undefined
  try {
    for await (const event of stream) {
      const evt = event as { type?: string; response?: ResponseObject }
      if (evt?.type === "response.completed" && evt.response) {
        finalResponse = evt.response
      }
      yield event
    }
  } catch (err) {
    recordError(span, err)
    throw err
  } finally {
    if (finalResponse) applyResponseAttributes(span, finalResponse)
    span.end()
  }
}
