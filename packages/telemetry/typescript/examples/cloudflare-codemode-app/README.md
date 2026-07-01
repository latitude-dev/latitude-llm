# Cloudflare Code Mode + Latitude

Minimal Cloudflare Code Mode project for validating Latitude telemetry.

The agent exposes a single `codemode` tool via `createCodeTool()`. The React page
uses `useAgentChat({ body })` so `onChatMessage()` can pass user/session context
to `latitude.getTracer("cloudflare-codemode", context)`.

## Run as a Worker

```bash
pnpm --filter @latitude-data/telemetry build
cd packages/telemetry/typescript/examples/cloudflare-codemode-app
npm install

cp .dev.vars.example .dev.vars
npx wrangler login

npm run dev
```

Then open the printed URL (e.g. `http://localhost:8788`). The page shows the
user id and session id it sends through `useAgentChat({ body })`.

`LATITUDE_PROJECT_SLUG` and `LATITUDE_TELEMETRY_URL` are set as `vars` in
`wrangler.jsonc`. `LATITUDE_TELEMETRY_URL` is only needed for local/self-hosted
Latitude — omit it to send traces to Latitude Cloud.

Code Mode requires a Worker Loader binding (`LOADER` in `wrangler.jsonc`) for
`DynamicWorkerExecutor`. Dynamic Worker loading is available in local Wrangler
development; production use may require Cloudflare's Dynamic Worker Loader beta.

The agent uses the `@cf/meta/llama-4-scout-17b-16e-instruct` Workers AI model.

## Verify Against Local Latitude

```bash
pnpm --filter @latitude-data/telemetry build
```

Then run the deterministic local verifier:

```bash
cd packages/telemetry/typescript/examples/cloudflare-codemode-app
LATITUDE_TELEMETRY_URL=http://localhost:3002 \
LATITUDE_API_KEY=lat_seed_default_api_key_token \
LATITUDE_PROJECT_SLUG=default-project \
npm run verify:local
```

The verifier uses AI SDK's mock model, forces a `codemode` tool call with
generated code that invokes `getWeather`, sends spans with
`latitude.getTracer("cloudflare-codemode", context)`, flushes the Latitude SDK,
and polls local ClickHouse for the generated session. It exits non-zero if spans
do not arrive, if no `codemode` tool span is stored, or if any span misses the
expected user/session context.

## What Latitude Captures

- Model turns from `streamText()` with `experimental_telemetry`
- The outer `codemode` tool call, including the generated code in tool input
- User, session, tags, and metadata from `getTracer("cloudflare-codemode", context)`

Inner tool calls that run inside the Code Mode sandbox (for example
`codemode.getWeather()` in generated code) are **not** emitted as separate AI SDK
tool spans. Instrument those `execute` functions manually if you need per-tool
visibility. See the Cloudflare Code Mode docs page in `docs/telemetry/frameworks/cloudflare-codemode.mdx`.
