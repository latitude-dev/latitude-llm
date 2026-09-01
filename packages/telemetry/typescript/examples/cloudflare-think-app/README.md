# Cloudflare Think + Latitude

Minimal Cloudflare Think project for validating Latitude telemetry with a
codemode `execute` tool and nested server-side tool spans.

The React page uses Think's default WebSocket chat path through
`useAgentChat({ body })`. The Worker reads that body in `beforeTurn()` and passes
the user/session context to `latitude.getTracer("cloudflare-think", context)`,
so model and tool spans are stored with `user_id` and `session_id`.

`MyAgent` exposes a codemode `execute` tool and a `draftItinerary` tool. Inside
codemode, the model can call three deterministic demo tools: `getWeather`,
`estimateTripBudget`, and `listCityHighlights`. The example uses
`createCodemodeTelemetry()` to wrap the codemode tool set and outer `execute`
tool, so internal tool spans are parented under `execute` and Latitude shows the
full codemode waterfall in one trace.

`draftItinerary` calls `Planner`, a second agent living in its own Durable
Object, over RPC. That object is a separate isolate with no shared memory, so
`MyAgent` hands the active tool span over with `injectTraceContext()` and
`Planner` rejoins it with `withTraceContext()`. Both agents report one trace, and
the planner shows up as a subagent of the tool call that invoked it.

Both agents flush through `createDurableObjectTelemetry()`. A Durable Object is
evicted whenever it goes idle with no hook that runs first, so anything still
buffered in the batch processor is lost; the helper flushes at the end of each
turn and coalesces concurrent callers onto one export.

## Run locally

```bash
pnpm --filter @latitude-data/telemetry build
cd packages/telemetry/typescript/examples/cloudflare-think-app
npm install

cp .dev.vars.example .dev.vars
# Add a local Anthropic key for the demo model. Do not commit .dev.vars.
# ANTHROPIC_API_KEY=sk-ant-api03-...

npm run dev
```

Then open the printed URL (for example `http://localhost:8787`) in a browser.
The page shows the user id and session id it sends through `useAgentChat({ body
})`, so you can find the trace in Latitude.

`LATITUDE_PROJECT_SLUG` and `LATITUDE_TELEMETRY_URL` are set as `vars` in
`wrangler.jsonc`. `LATITUDE_TELEMETRY_URL` is only needed for local/self-hosted
Latitude. Omit it to send traces to Latitude Cloud.

The agent uses Anthropic `claude-sonnet-4-5` through the AI SDK Anthropic
provider. The codemode execute tool requires the `LOADER` Worker Loader binding
configured in `wrangler.jsonc`.

## Verify against local Latitude

```bash
pnpm --filter @latitude-data/telemetry build
```

Then run the deterministic local verifier:

```bash
cd packages/telemetry/typescript/examples/cloudflare-think-app
LATITUDE_TELEMETRY_URL=http://localhost:3002 \
LATITUDE_API_KEY=lat_seed_default_api_key_token \
LATITUDE_PROJECT_SLUG=cloudflare-think-test \
npm run verify:local
```

The verifier uses AI SDK's mock model, forces an `execute` tool call and a
`draftItinerary` tool call, sends spans with
`latitude.getTracer("cloudflare-think", context)`, then runs the planner turn
from the carrier alone after the orchestrator turn has closed — the same late,
out-of-order arrival an evicted Durable Object produces. It flushes the Latitude
SDK and polls local ClickHouse for the generated session. It exits non-zero if
spans do not arrive, if no `execute` tool span is stored, if any span misses the
expected user/session context, or if the planner's spans did not join the
orchestrator's trace under the `draftItinerary` tool span.
