import { Tracer as EffectOtelTracer, Resource } from "@effect/opentelemetry"
import { trace } from "@opentelemetry/api"
import { Effect, Layer } from "effect"

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
  Effect.suspend((): Effect.Effect<A, E, R> => Effect.provide(bridgeActiveOtelSpan(effect), EffectOtelTracerLive))
