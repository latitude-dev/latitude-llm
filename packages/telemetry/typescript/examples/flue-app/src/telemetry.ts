import { createOpenTelemetryObserver } from "@flue/opentelemetry"
import { observe } from "@flue/runtime"
import { Latitude } from "@latitude-data/telemetry"

new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  serviceName: "flue-example",
  disableBatch: true,
})

// Flue omits prompts, completions, tool values, and logs by default. This
// example opts every event in so the full conversation shows up in Latitude.
// Sanitize per-event before enabling this on data you can't store.
observe(createOpenTelemetryObserver({ exportContent: (event) => event }))
