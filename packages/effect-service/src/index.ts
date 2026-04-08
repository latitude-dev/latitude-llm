import { ServiceMap } from "effect"

/**
 * Class-style Effect service tags (dependency-injection keys).
 *
 * Upstream effect-smol documentation calls this API `Context.Service`. In the
 * pinned `effect` package it is still exposed as `ServiceMap.Service`; this
 * alias matches migration docs and keeps call sites stable if the symbol moves.
 */
export const EffectService = ServiceMap.Service
