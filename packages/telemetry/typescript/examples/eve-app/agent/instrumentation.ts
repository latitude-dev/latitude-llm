import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { defineInstrumentation } from "eve/instrumentation";
import { registerOTel } from "@vercel/otel";

// eve auto-discovers this file and runs it at startup, implicitly enabling
// telemetry. eve emits standard Vercel AI SDK spans (ai.eve.turn, ai.streamText,
// ai.toolCall, …) carrying eve.* attributes; Latitude ingests them directly.
export default defineInstrumentation({
  setup: ({ agentName }) =>
    registerOTel({
      serviceName: agentName,
      traceExporter: new OTLPTraceExporter({
        url: `${process.env.LATITUDE_TELEMETRY_URL ?? "https://ingest.latitude.so"}/v1/traces`,
        headers: {
          Authorization: `Bearer ${process.env.LATITUDE_API_KEY!}`,
          "X-Latitude-Project": process.env.LATITUDE_PROJECT_SLUG!,
        },
      }),
    }),
});
