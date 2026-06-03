import { Effect } from "effect"
import type { IncidentMonitorInfo, IncidentMonitorReaderShape } from "../ports/incident-monitor-reader.ts"

/** In-memory `IncidentMonitorReader`. Seed `monitorAlertId → info`; unknown ids resolve to `null`. */
export const createFakeIncidentMonitorReader = (seed: ReadonlyMap<string, IncidentMonitorInfo> = new Map()) => {
  const reader: IncidentMonitorReaderShape = {
    findByAlertId: (monitorAlertId) => Effect.succeed(seed.get(monitorAlertId) ?? null),
  }
  return { reader }
}
