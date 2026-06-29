# Cloudflare Think + Latitude

Minimal Cloudflare Think project for validating Latitude telemetry, including
server-side tool calls.

The React page uses Think's default WebSocket chat path through
`useAgentChat({ body })`. The Worker reads that body in `beforeTurn()` and passes
the user/session context to `latitude.getAiSdkTracer(context)`, so the AI SDK
model and tool spans are stored with `user_id` and `session_id`.

## Run as a Worker

```bash
pnpm --filter @latitude-data/telemetry build
cd packages/telemetry/typescript/examples/cloudflare-think-app
npm install

# Local secrets for Vite/Wrangler dev (gitignored). LATITUDE_API_KEY is a secret,
# so it lives here rather than in wrangler.jsonc:
cp .dev.vars.example .dev.vars

# The `AI` binding always runs against Cloudflare (even in local dev), so log in:
npx wrangler login

npm run dev
```

Then open the printed URL (e.g. `http://localhost:8787`) in a browser. The page
shows the user id and session id it sends through `useAgentChat({ body })`, so
you can find the trace in Latitude.

`LATITUDE_PROJECT_SLUG` and `LATITUDE_TELEMETRY_URL` are set as `vars` in
`wrangler.jsonc`. `LATITUDE_TELEMETRY_URL` is only needed for local/self-hosted
Latitude — omit it to send traces to Latitude Cloud.

The agent uses the `@cf/meta/llama-4-scout-17b-16e-instruct` Workers AI model
(it supports function calling). If Cloudflare deprecates it, pick another
function-calling model from the [Workers AI catalog](https://developers.cloudflare.com/workers-ai/models/)
and update `getModel()` in `src/worker.ts`.

## Verify Against Local Latitude

```bash
pnpm --filter @latitude-data/telemetry build
```

Then run the deterministic local verifier:

```bash
cd packages/telemetry/typescript/examples/cloudflare-think-app
LATITUDE_TELEMETRY_URL=http://localhost:3002 \
LATITUDE_API_KEY=lat_seed_default_api_key_token \
LATITUDE_PROJECT_SLUG=default-project \
npm run verify:local
```

The verifier uses AI SDK's mock model, forces a `getWeather` tool call, sends
spans with `latitude.getAiSdkTracer(context)`, flushes the Latitude SDK, and
polls local ClickHouse for the generated session. It exits non-zero if spans do
not arrive, if no `ai.toolCall` span is stored, or if any span misses the
expected user/session context.
