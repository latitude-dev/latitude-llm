import { z } from "zod"

/**
 * The telemetry stream a query-time monitor watches. A monitor target is a
 * `(stream, FilterSet)` pair: tools/users/saved-searches/raw-traffic are all
 * just FilterSet presets over one of these streams (see specs/signals.md).
 * `scores`/`signal_occurrences` are intentionally absent — issue/signal
 * monitoring stays on its own path until the signals migration folds them in.
 */
export const MONITOR_STREAMS = ["traces", "spans", "sessions"] as const
export const monitorStreamSchema = z.enum(MONITOR_STREAMS)
export type MonitorStream = z.infer<typeof monitorStreamSchema>
