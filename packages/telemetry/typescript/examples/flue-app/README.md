# Flue → Latitude example

A minimal [Flue](https://flueframework.com) project that exports its workflow,
operation, model-turn, and tool spans to Latitude.

Flue emits OpenTelemetry spans itself through `@flue/opentelemetry`, so there is
no provider-specific `instrumentations` entry. You initialize the Latitude SDK
(which configures the OpenTelemetry provider + exporter) and register Flue's
observer. See [`src/telemetry.ts`](src/telemetry.ts).

## Layout

| Path | Purpose |
| --- | --- |
| `src/telemetry.ts` | Initializes `Latitude` and registers `createOpenTelemetryObserver()`. Imported for its side effects. |
| `src/app.ts` | Flue HTTP entrypoint; imports `./telemetry.ts` so telemetry is live before any workflow runs. |
| `src/workflows/translate.ts` | A one-prompt workflow that translates text via `openai/gpt-4o-mini`. |

## Run it

```bash
npm install
cp .env.example .env   # fill in LATITUDE_API_KEY, LATITUDE_PROJECT_SLUG, OPENAI_API_KEY
                       # point LATITUDE_TELEMETRY_URL at your instance (http://localhost:3002 for local)
```

One-shot (note: a one-shot process can exit before spans flush — prefer the dev
server below when verifying ingestion):

```bash
npm run run:translate
```

Long-running server (recommended for verifying ingestion — the process stays up
so spans flush):

```bash
npm run dev   # serves on http://localhost:3583
curl 'http://localhost:3583/workflows/translate?wait=result' \
  -H 'Content-Type: application/json' \
  -d '{"text":"Good morning","language":"Spanish"}'
```

## What you'll see in Latitude

A trace under service `flue-example`:

```
flue.workflow translate
  └─ flue.operation prompt
       └─ chat gpt-4o-mini      (gen_ai.* model turn: provider, tokens, cost)
            └─ flue.tool finish
```

## Exporting content

Flue omits prompts, completions, tool values, and logs by default. This example
opts every event in via `exportContent: (event) => event` so the conversation is
visible. Sanitize per-event before enabling that on data you can't store — see
the [Flue docs](https://docs.latitude.so/telemetry/frameworks/flue).
