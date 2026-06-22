import { z } from "zod"

/**
 * Internal telemetry query streams used after a product monitor target has been
 * resolved to ClickHouse reads.
 */
export const MONITOR_STREAMS = ["traces", "spans", "sessions"] as const
export const monitorStreamSchema = z.enum(MONITOR_STREAMS)
export type MonitorStream = z.infer<typeof monitorStreamSchema>
