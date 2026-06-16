import { z } from "zod"

/**
 * Telemetry sources a destination can export. v1: spans only. Append-only
 * sources slot in here freely; mutable sources (issues, behaviours) additionally
 * need soft-delete + the change-set deliverer (LAT-684, half B) before they can
 * be added.
 */
export const DESTINATION_SOURCES = ["spans"] as const
export const destinationSourceSchema = z.enum(DESTINATION_SOURCES)
export type DestinationSource = z.infer<typeof destinationSourceSchema>
