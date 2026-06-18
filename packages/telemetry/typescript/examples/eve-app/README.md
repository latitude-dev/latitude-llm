# Eve → Latitude example

A minimal [Eve](https://eve.dev) agent that exports its turn, step, model-call,
and tool spans to Latitude.

Eve is built on the Vercel AI SDK and exports standard OpenTelemetry spans
(`ai.eve.turn`, `ai.streamText`, `ai.toolCall`, …) through whatever exporter you
register in `agent/instrumentation.ts`. Latitude already understands Vercel AI
SDK spans plus Eve's `eve.*` attributes, so no Latitude SDK is required — the
exporter points straight at Latitude's OTLP endpoint. See
[`agent/instrumentation.ts`](agent/instrumentation.ts).

> This is a standalone Eve project (its own `package.json`, `pnpm-workspace.yaml`,
> and `ai@7` beta). It is intentionally excluded from the monorepo workspace so
> its large dependency tree never lands in the repo lockfile.

## Layout

| Path | Purpose |
| --- | --- |
| `agent/instrumentation.ts` | `registerOTel(...)` with an OTLP exporter aimed at Latitude. Auto-discovered at startup. |
| `agent/agent.ts` | Declares the model. Uses the OpenAI provider directly (`@ai-sdk/openai`) to avoid the Vercel AI Gateway. |
| `agent/instructions.md` | The agent's system prompt. |

## Run it

```bash
pnpm install
cp .env.example .env.local   # fill in LATITUDE_API_KEY, LATITUDE_PROJECT_SLUG, OPENAI_API_KEY
                             # point LATITUDE_TELEMETRY_URL at your instance (http://localhost:3002 for local)
```

Start the dev server headless and send a turn over the built-in eve channel:

```bash
pnpm exec eve dev --no-ui --port 2000

# in another shell:
curl -X POST http://localhost:2000/eve/v1/session \
  -H 'Content-Type: application/json' \
  -d '{"message":"What is the capital of France?"}'
```

## What you'll see in Latitude

Spans under service `eve-app`, with `eve.session.id` read into the trace's
session id:

```
ai.eve.turn                      {eve.session.id}
  └─ invoke_agent gpt-4o-mini    (gen_ai.* model turn: provider, tokens, cost)
       └─ chat gpt-4o-mini
            └─ fetch POST .../v1/responses
```

## Recording inputs/outputs

Eve records full message history and model outputs on spans by default
(`recordInputs` / `recordOutputs`). Set them to `false` in
`agent/instrumentation.ts` for sensitive or regulated data — see the
[Eve docs](https://docs.latitude.so/telemetry/frameworks/eve).
