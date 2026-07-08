import { Tracer as EffectOtelTracer, Resource } from "@effect/opentelemetry"
import { trace } from "@opentelemetry/api"
import { Effect, Layer, Tracer } from "effect"
import * as Exit from "effect/Exit"
import { exitHasOnlyExpectedClientErrors } from "./effect-tracer-client-errors.ts"

/**
 * Bridges Effect's Tracer to the already-running OTel TracerProvider.
 *
 * Tracer.layerGlobal reads the global OTel TracerProvider (set by NodeSDK.start()).
 * Parenting to an already-active non-Effect OTel span is handled in `withTracing`
 * so request / worker root spans remain the parent of nested Effect spans.
 *
 * Resource.layerFromEnv reads OTEL_SERVICE_NAME and OTEL_RESOURCE_ATTRIBUTES,
 * both already set by startTracing() in otel.ts.
 */
export const EffectOtelTracerLive = EffectOtelTracer.layerGlobal.pipe(Layer.provide(Resource.layerFromEnv()))

const wrapSpan = (span: Tracer.Span): Tracer.Span =>
  new Proxy(span, {
    get(target, prop, receiver) {
      if (prop === "end") {
        return (endTime: bigint, exit: Exit.Exit<unknown, unknown>) => {
          target.end(endTime, exitHasOnlyExpectedClientErrors(exit) ? Exit.void : exit)
        }
      }
      return Reflect.get(target, prop, receiver)
    },
  })

const ClientErrorSuppressingTracerLive = Layer.effect(
  Tracer.Tracer,
  Effect.gen(function* () {
    const inner = yield* Tracer.Tracer
    return Tracer.make({
      span(options) {
        return wrapSpan(inner.span(options))
      },
      ...(inner.context !== undefined ? { context: inner.context } : {}),
    })
  }),
).pipe(Layer.provide(EffectOtelTracerLive))

const bridgeActiveOtelSpan = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => {
  const activeSpan = trace.getActiveSpan()

  if (!activeSpan) {
    return effect
  }

  return effect.pipe(EffectOtelTracer.withSpanContext(activeSpan.spanContext()))
}

/**
 * Pipe combinator to provide the OTel tracer layer to any effect.
 *
 * Expected 4xx `HttpError`s end traced spans as success so Datadog Error
 * Tracking does not treat intentional client rejections as server faults. The
 * error still propagates to callers after the span ends.
 *
 * @example
 * ```ts
 * const result = await Effect.runPromise(
 *   myEffect.pipe(
 *     withPostgres(...),
 *     withTracing,
 *   ),
 * )
 * ```
 */
export const withTracing = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.suspend(
    (): Effect.Effect<A, E, R> =>
      Effect.provide(bridgeActiveOtelSpan(effect), Layer.fresh(ClientErrorSuppressingTracerLive)),
  )
