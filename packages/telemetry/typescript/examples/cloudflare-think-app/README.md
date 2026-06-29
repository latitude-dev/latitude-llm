# Cloudflare Think + Latitude

Minimal Cloudflare Think project for validating Latitude telemetry, including
server-side tool calls.

## Run as a Worker

```bash
pnpm --filter @latitude-data/telemetry build
cd packages/telemetry/typescript/examples/cloudflare-think-app
npm install
npm run dev
```

Set these secrets or variables in your Worker:

```bash
LATITUDE_API_KEY=lat_seed_default_api_key_token
LATITUDE_PROJECT_SLUG=default-project
LATITUDE_TELEMETRY_URL=http://localhost:3002
```

`LATITUDE_TELEMETRY_URL` is only needed for local/self-hosted Latitude. Omit it
to send traces to Latitude Cloud.

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
spans to the local ingest service, flushes the Latitude SDK, and polls local
ClickHouse for the generated session. It exits non-zero if spans do not arrive
or if no `ai.toolCall` span is stored.
