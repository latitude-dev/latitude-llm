# Claude Code telemetry in Latitude

## Goal

Let a Claude Code user point their CLI at Latitude and see each session in the
Latitude dashboard, with **full, untruncated conversation content** including
user prompts, assistant responses, and tool I/O — matching what Langfuse ships
at `langfuse.com/integrations/other/claude-code`.

## Supported surfaces

Claude Code runs in four places. The hook approach covers the three that
execute locally:

| Surface | Covered | Why |
| --- | --- | --- |
| CLI (`claude` in terminal) | ✅ | Reads `~/.claude/settings.json`, spawns local command hooks. |
| Desktop app (Mac / Windows) | ✅ | Shares the same settings file and hook lifecycle as the CLI. Worth smoke-testing before GA. |
| IDE extensions (VS Code, JetBrains) | ✅ | Invoke Claude Code locally under the hood. |
| Web app (claude.ai/code) | ❌ | Runs in Anthropic's cloud — no filesystem, no local process, no way to execute a command hook. |

Web-app users are out of scope. If that becomes a real segment we'd need an
Anthropic-side integration we can't build ourselves.

## Why hooks, not native OTEL

Claude Code has native OpenTelemetry export, but it's a poor fit for a
conversation-inspection product:

1. **Full conversation gated behind `OTEL_LOG_RAW_API_BODIES=1`**, and only
   emitted as log events (`claude_code.api_request_body` /
   `api_response_body`), not as traces. Latitude's `/v1/traces` endpoint would
   never see them.
2. **60 KB truncation** per API body — real sessions blow past it. A long
   session's conversation history is silently lost.
3. **Extended-thinking is always redacted** from API bodies, regardless of
   flags.
4. **Four separate opt-in flags** (`OTEL_LOG_USER_PROMPTS`,
   `OTEL_LOG_TOOL_DETAILS`, `OTEL_LOG_TOOL_CONTENT`, `OTEL_LOG_RAW_API_BODIES`)
   before users get anything useful.

The `Stop` hook reads the **session transcript JSONL** directly off disk. No
truncation, no redaction, no flag combinatorics — it's the exact file Claude
Code uses to reconstruct context. That's why Langfuse went this route, and
it's why we should too.

Trade-off we accept: the hook loses native OTEL metrics
(`claude_code.cost.usage`, `claude_code.token.usage`, session/commit/PR
counters). We can reconstruct all of these from transcript data — it contains
`message.usage` per assistant turn with input/output/cache tokens and enough
metadata to compute cost.

## How the integration works

### Claude Code side

User adds two things to `~/.claude/settings.json`:

```json
{
  "env": {
    "LATITUDE_API_KEY": "lat_xxx",
    "LATITUDE_BASE_URL": "https://ingest.latitude.so"
  },
  "hooks": {
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "npx -y @latitude-data/claude-code" }
        ]
      }
    ]
  }
}
```

That's it. The `Stop` hook fires after every assistant turn. Claude Code
passes `session_id`, `transcript_path`, `cwd` as JSON on stdin. Our script
does the rest.

### Our hook script (`@latitude-data/claude-code`)

A small Node CLI published as an npm package. Node is already a Claude Code
dependency, so no new runtime. On each invocation:

1. Read hook payload (JSON on stdin) → extract `session_id`,
   `transcript_path`.
2. Look up `~/.claude/state/latitude/<session_id>.json` for the last processed
   byte offset (Langfuse-style incremental reader — never re-read the full
   transcript).
3. Tail the transcript JSONL from that offset; parse new lines.
4. Group new messages into OTLP spans:
   - **Session span** (root) — one per `session_id`, created on first
     invocation.
   - **Turn span** — one per user prompt → assistant response cycle, child of
     session.
   - **Generation span** — wraps the assistant response, carries
     `model`, `input_tokens`, `output_tokens`, `cache_read_tokens`,
     `cost_usd` from `message.usage`.
   - **Tool span** — one per `tool_use` block, with `tool_name`,
     `tool_input`, and the matching `tool_result` from the next user message.
5. POST the OTLP payload (JSON or protobuf) to
   `${LATITUDE_BASE_URL}/v1/traces` with
   `Authorization: Bearer ${LATITUDE_API_KEY}`.
6. Persist the new offset + dedup state atomically (`fcntl` lock on Unix).
7. Exit `0` on success. **Always exit `0` on failure** — a non-zero exit from
   a `Stop` hook would block Claude from finishing its turn.

Configure the hook with `async: true` so the user doesn't wait for our POST.

### Latitude side

Most of the backend is already in place:

- `POST /v1/traces` accepts OTLP (`apps/ingest/src/routes/traces.ts:19`).
- Bearer-token auth (`packages/platform/api-key-auth`).
- A `parseClaudeCode` content parser lives at
  `packages/domain/spans/src/otlp/content/claude-code.ts`, keyed off
  `service.name=claude-code` resource attribute.
- Identity resolvers already pick up `session.id`, `user.email` from resource
  attributes.

What we need to change:

1. Extend `parseClaudeCode` to handle the three new span shapes our hook
   emits (`turn`, `generation`, `tool`) — today it only parses a single
   `interaction` span with `user_prompt`.
2. Extend the operation resolver
   (`packages/domain/spans/src/otlp/resolvers/operation.ts`) to classify turn
   vs generation vs tool vs session spans so the trace UI renders them
   correctly.
3. Add a test fixture in
   `packages/domain/spans/src/otlp/tests/claude-code.test.ts` using a real
   transcript captured from a `claude` session.

No new endpoints. No new ClickHouse columns. Traces table already has
`session_id`, `tokens_input/output`, `cost_*`, `input_messages`,
`output_messages`.

## Deliverables

1. **`packages/integrations/claude-code/`** (new package) — the hook CLI.
   - `src/index.ts` — entrypoint that reads stdin, routes to handler.
   - `src/transcript.ts` — incremental JSONL reader + state file.
   - `src/otlp.ts` — transcript → OTLP spans transform.
   - `src/client.ts` — POST to `/v1/traces`.
   - Published to npm as `@latitude-data/claude-code`.
2. **Server-side parser updates** — three items listed above under "Latitude
   side".
3. **Docs page** `docs/integrations/claude-code.md` — the four-line setup
   block + a privacy note.
4. **Rate-limit sanity check** — default Claude Code session fires `Stop`
   roughly once every 10–60s, so we're well inside
   `apps/ingest/src/rate-limit/trace-ingestion.ts` defaults. Worth confirming
   with a multi-hour session.

## What we deliberately don't ship

- A dedicated Claude Code dashboard. The existing trace UI covers it.
- Metrics ingestion (`/v1/metrics`). Tokens + cost are on the generation
  span; everything else (LoC, commits, PRs) is lower-value and
  reconstructable from git.
- Log ingestion (`/v1/logs`). The hook gives us fuller data than OTEL logs
  would.
- `otelHeadersHelper` / dynamic-token refresh. Static bearer token is fine;
  enterprise users can wrap the command.
- Native OTEL as an alternative entry point. Supporting two ingestion paths
  doubles the parser surface area. Pick hooks, document it as the only way.

## Open questions

- **Package scope.** Publish as `@latitude-data/claude-code` under the
  existing npm org, or as a standalone package? I'd lean toward the org —
  names the provenance clearly.
- **Public ingest hostname.** Confirm `https://ingest.latitude.so` is the
  canonical URL to put in docs.
- **Privacy posture.** Unlike the OTEL path, this captures the full
  conversation the moment the hook is installed. The docs need a clear
  "this sends your prompts, assistant responses, and tool I/O to Latitude"
  banner. No surprise data collection.
- **Subagent transcripts.** `SubagentStop` fires with its own
  `agent_transcript_path`. Do we surface subagents as nested spans under the
  parent turn, or as separate traces? Affects trace-tree readability.
- **Self-hosted.** Docs should include a `LATITUDE_BASE_URL` override
  example for self-hosted installs.
