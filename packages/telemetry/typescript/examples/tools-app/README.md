# Tools app

A sample app for inspecting how tool calls reach Latitude. It drives the Vercel AI SDK against
OpenAI-hosted, provider-executed tools (MCP, web search, tool search, code interpreter, file search)
plus an app-executed tool as a control, sends telemetry to a local Latitude instance using the SDK
source in this repo, and prints what the app process saw next to what telemetry actually carried.

It exists because provider-executed tools do not bubble their outputs into Latitude. See
[what is missing](#what-is-missing-and-why) below.

Nothing here is wired into CI. It imports `../../src` directly, so edits to the telemetry SDK take
effect on the next run with no build step.

## Setup

The app reads env from wherever you point `--env-file`. `examples/.env` is already set up for the
local instance (`LATITUDE_API_KEY`, `LATITUDE_PROJECT_SLUG=saloon`,
`LATITUDE_TELEMETRY_URL=http://localhost:3002`) but has **no `OPENAI_API_KEY`** — add one, or copy
`.env.example` here and use that file instead.

Start the local Latitude instance yourself (`apps/ingest` on port 3002). The app runs without it;
the OTLP export just fails and the span dump is still written.

## Running

From `packages/telemetry/typescript`:

```bash
pnpm tsx --env-file=examples/.env examples/tools-app/run.ts web-search
pnpm tsx --env-file=examples/.env examples/tools-app/run.ts all
pnpm tsx examples/tools-app/inspect.ts web-search   # re-read a dump, no API calls
```

| Scenario | Tool | Executed by |
| --- | --- | --- |
| `client-tool` | `getWeather` | app (control) |
| `web-search` | `openai.tools.webSearch` | provider |
| `web-search-stream` | `openai.tools.webSearch` via `streamText` | provider |
| `mcp` | `openai.tools.mcp` (hosted MCP server) | provider |
| `code-interpreter` | `openai.tools.codeInterpreter` | provider |
| `tool-search` | `openai.tools.toolSearch` + a deferred app tool | provider + app |
| `mixed` | web search + `getWeather` in one call | both |
| `file-search` | `openai.tools.fileSearch` | provider (needs `OPENAI_VECTOR_STORE_ID`) |

`mcp` defaults to the public DeepWiki server; override with `MCP_SERVER_URL`, `MCP_SERVER_LABEL`,
and `MCP_AUTHORIZATION`.

## What it produces

Each run writes `.spans/<scenario>.json` (gitignored): every span the AI SDK emitted, snapshotted
pre-redaction, with `passesSmartFilter` recording whether Latitude's export filter would keep it.
`inspect.ts` then replays each span through the **real ingest parsers** (`parseContent`,
`resolveOperation`, `resolveToolExecution` from `packages/domain/spans`) and prints a verdict:

```
── verdict
  app process received   1 tool call(s), 1 result(s)
  telemetry carried      1 tool call(s), 0 result(s)
  execute_tool spans     0
  Latitude would show    1 tool_call, 0 tool_call_response
  MISSING                0 input(s), 1 output(s)
```

So a fix can be validated from the dump alone, without reading the Latitude UI.

## What is missing, and why

Verified against `ai@7.0.66`, `@ai-sdk/openai@4.0.42` and `@ai-sdk/otel@1.0.66`, and filed upstream
as [vercel/ai#19007](https://github.com/vercel/ai/issues/19007). Three gaps, all upstream of
Latitude:

1. **No tool span.** `@ai-sdk/otel` opens its `execute_tool` span from `onToolExecutionStart`, which
   fires out of the AI SDK's tool-execution path. A provider-executed tool has no `execute`, so that
   path returns early and no span is created. The remote call's duration is invisible as a result: it
   sits inside the `chat` span with no attribution. Latitude's `resolveToolExecution` already reads
   `gen_ai.tool.call.arguments` / `gen_ai.tool.call.result`, so it would render such a span correctly
   if one existed.
2. **No tool output.** `formatOutputMessages` builds `gen_ai.output.messages` from text, reasoning,
   `tool-call` and file parts only; `tool-result` parts are dropped. For OpenAI-hosted tools the
   call, the result and the final text all arrive in a single step, so there is no following step
   whose `gen_ai.input.messages` would re-carry the result. The output reaches nothing.
3. **Incomplete tool definitions.** Hosted MCP calls are named `mcp.<remoteTool>`, but
   `gen_ai.tool.definitions` carries only the container tool `mcp`. The provider receives the real
   list as an `mcp_list_tools` item and discards it, so nothing describes the tools that were
   actually called and any check reconciling calls against declarations reports a false mismatch.

Tool call arguments do arrive intact for hosted MCP. What is lost is the outputs, the timing, and the
definitions.

The payloads exist in-process the whole time: `result.steps[].content` holds the
`tool-call`/`tool-result` pair with `providerExecuted: true`, which is what the `app process
received` line above counts.

## Version note

The app targets AI SDK **v7** (`ai7` + `@ai-sdk/openai7` + `@ai-sdk/otel`), the pair that works in
this repo. The v6 stack cannot run here at all: the root `pnpm.overrides` pin of
`@ai-sdk/provider: 4.0.0-beta.7` makes `@ai-sdk/openai@4` emit a spec-v4 model that `ai@6` rejects
with `AI_UnsupportedModelVersionError`. `examples/test_vercel_ai.ts` fails the same way today.
