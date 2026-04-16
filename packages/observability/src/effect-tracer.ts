import { Resource, Tracer } from "@effect/opentelemetry"
import { Effect, Layer } from "effect"

/**
 * Bridges Effect's Tracer to the already-running OTel TracerProvider.
 *
 * Tracer.layerGlobal reads the global OTel TracerProvider (set by NodeSDK.start())
 * and picks up active OTel spans as parents (e.g. HTTP request spans from Hono middleware).
 *
 * Resource.layerFromEnv reads OTEL_SERVICE_NAME and OTEL_RESOURCE_ATTRIBUTES,
 * both already set by startTracing() in otel.ts.
 */
export const EffectOtelTracerLive = Tracer.layerGlobal.pipe(Layer.provide(Resource.layerFromEnv()))

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
export const withTracing = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provide(effect, EffectOtelTracerLive)
