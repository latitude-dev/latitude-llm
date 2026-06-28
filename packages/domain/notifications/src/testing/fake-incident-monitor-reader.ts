import { Effect } from "effect"
import type { IncidentMonitorInfo, IncidentMonitorReaderShape } from "../ports/incident-monitor-reader.ts"

export const createFakeIncidentMonitorReader = (seed: ReadonlyMap<string, IncidentMonitorInfo> = new Map()) => {
  const reader: IncidentMonitorReaderShape = {
    findByMonitorId: (monitorId) => Effect.succeed(seed.get(monitorId) ?? null),
  }
  return { reader }
}
