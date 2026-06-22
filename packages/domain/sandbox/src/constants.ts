/**
 * Default resource limits for sandboxed script runs.
 *
 * `cpuTicks` is an interrupt-handler budget: the engine invokes the interrupt
 * callback periodically while interpreting, so the tick count is a
 * deterministic, wall-clock-independent proxy for an instruction budget.
 * `wallTimeMs` bounds the whole run including host calls.
 */
export interface ScriptRunLimits {
  readonly wallTimeMs: number
  readonly cpuTicks: number
  readonly memoryBytes: number
  readonly stackSizeBytes: number
}

const MEGABYTE = 1024 * 1024

export const DEFAULT_SCRIPT_MEMORY_BYTES = 64 * MEGABYTE
/**
 * Must stay well below the engine's native (WASM) stack so the sandbox's
 * soft limit trips first and recursion dies inside the boundary instead of
 * unwinding across it.
 */
export const DEFAULT_SCRIPT_STACK_SIZE_BYTES = 320 * 1024

/**
 * Inline lane: pure detectors do milliseconds of string work per trace.
 * One interrupt tick ≈ 0.5ms of busy interpretation in the QuickJS-WASM
 * build, so 2,000 ticks ≈ 1s of CPU — matching the wall budget.
 */
export const DEFAULT_PURE_SCRIPT_LIMITS: ScriptRunLimits = {
  wallTimeMs: 1_000,
  cpuTicks: 2_000,
  memoryBytes: DEFAULT_SCRIPT_MEMORY_BYTES,
  stackSizeBytes: DEFAULT_SCRIPT_STACK_SIZE_BYTES,
}

/** Queued lane: `llm`-capability runs are dominated by the model call. */
export const DEFAULT_LLM_SCRIPT_LIMITS: ScriptRunLimits = {
  wallTimeMs: 120_000,
  cpuTicks: 20_000,
  memoryBytes: DEFAULT_SCRIPT_MEMORY_BYTES,
  stackSizeBytes: DEFAULT_SCRIPT_STACK_SIZE_BYTES,
}

/**
 * Default membership threshold: `matched = result.value >= threshold`.
 * Per-signal rows override it (`signals.threshold`); evaluations use the
 * default until the signals rollout introduces per-owner knobs.
 */
export const DEFAULT_SCRIPT_SCORE_THRESHOLD = 0.5

/** Detector-health degradation window and thresholds (fixed window). */
export const DETECTOR_HEALTH_WINDOW_SECONDS = 3_600
export const DETECTOR_HEALTH_MIN_RUNS = 10
export const DETECTOR_HEALTH_DEGRADED_ERROR_RATE = 0.25
