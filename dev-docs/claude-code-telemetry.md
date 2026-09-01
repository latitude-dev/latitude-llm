# Claude Code telemetry

Latitude ingests Claude Code sessions via a `Stop` hook that ships the full session transcript as OTLP traces. This page covers the user-facing integration. For the architectural rationale (hooks vs. native OTEL), see [`prd/claude-code-telemetry.md`](../prd/claude-code-telemetry.md).

The hook is registered on **two** events. `Stop` fires after each assistant turn and stays `async`, keeping interactive turns unblocked. `SessionEnd` is registered **synchronously**, because Claude Code registers an async Stop hook but exits before spawning it in headless mode — a probe hook under `async` never executed once for `claude -p`, while the same hook registered synchronously ran and received its full payload. Since headless is how one harness drives another, `SessionEnd` is what makes cross-harness correlation possible at all. It also fires on interactive quit (`reason: prompt_input_exit`) and on Ctrl-C, catching a final turn whose async Stop hook died with the process; only `SIGKILL` escapes both. Unknown hook events are ignored by Claude Code, so the `SessionEnd` entry is inert on versions that predate it.

Double emission is prevented by the incremental design rather than by coordination: both events run the same binary, and whichever runs second finds the transcript offset already advanced behind the state lock. Both hand their work to a detached worker (`detached: true`, so `setsid` moves it out of the session's process group and it survives the session exiting), which keeps the synchronous `SessionEnd` from delaying session teardown — it returns in ~0.03s rather than the ~0.32s an `npx`-resolved inline run costs. `LATITUDE_CLAUDE_CODE_DETACH=0` forces the inline path.

Correlating this harness's spans with another one's — joining a parent's trace, or handing this trace to a child process — is the shared contract in [`trace-correlation.md`](trace-correlation.md).

## User setup

Paste into `~/.claude/settings.json`:

```json
{
  "env": {
    "LATITUDE_API_KEY": "lat_xxx",
    "LATITUDE_PROJECT": "my-project-slug",
    "LATITUDE_BASE_URL": "https://ingest.latitude.so"
  },
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npx -y @latitude-data/claude-code-telemetry@latest"
          }
        ]
      }
    ]
  }
}
```

The `@latest` tag makes the hook self-update: `npx` re-resolves the newest published version on each run (a cheap, etag-revalidated metadata check — a full download only when a new version ships), so users pick up fixes without re-installing. A bare `npx <pkg>` would reuse whatever the npx cache first fetched and never update. Keep `Stop` `async` so this resolution stays off the turn's critical path — `npx` costs ~0.32s per invocation against ~0.03s for a resolved local path, and pinning the version does not help (the cost is npx's own resolution, not the `@latest` check). `SessionEnd` pays it once per session instead, off the critical path via the detached worker.

The hook runs on every assistant-turn completion. It reads **new** lines from the session transcript since the last run (state is tracked at `~/.claude/state/latitude/state.json`), converts them into OTLP spans, and POSTs to `${LATITUDE_BASE_URL}/v1/traces` with `Authorization: Bearer ${LATITUDE_API_KEY}` and `X-Latitude-Project: ${LATITUDE_PROJECT}`. The project must already exist under the organization that owns the API key.

## Ingestion shape

Each turn produces three kinds of spans, all routed through the existing `apps/ingest` OTLP endpoint:

| `span.type` | Maps to `Operation` | Carries |
| --- | --- | --- |
| `interaction` | `invoke_agent` | Root of the turn — the agent boundary that orchestrates the turn's generations and tool calls. `user_prompt`, `session.id`, `interaction.duration_ms`. |
| `llm_request` | `chat` | Child of interaction. `model`, token counts (input/output/cache_read/cache_creation), `gen_ai.input.messages`, `gen_ai.output.messages` (full conversation as JSON). |
| `tool_execution` or `tool` | `execute_tool` | Child of llm_request, one per tool call. `tool.name`, `tool.id`, `tool.input`, `tool.output`. |

The [Anthropic Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) uses the same CLI and can emit OTLP without the hook ([observability](https://code.claude.com/docs/en/agent-sdk/observability)). Native exports often use span **names** such as `claude_code.interaction`, `claude_code.llm_request`, and `claude_code.tool`; ingest maps those to the same operations as `span.type`-based spans (`resolveOperation` in `operation.ts`).

Server-side routing lives in `packages/domain/spans/src/otlp/resolvers/operation.ts` (`CLAUDE_CODE_OPERATION` map) and `packages/domain/spans/src/otlp/content/claude-code.ts`. The `gen_ai.input.messages` / `gen_ai.output.messages` attributes are parsed by the generic `parseGenAICurrent` parser, which takes precedence over `parseClaudeCode`.

### Subagents (`Agent` tool)

`Agent` tool calls spawn subagents whose transcripts live in separate files (`<session>/subagents/agent-<agentId>.jsonl`). The hook emits each subagent's turns as a nested `interaction` → `llm_request` → `tool:*` tree parented under its `tool:Agent` span. Subagent spans carry `subagent.id` (`<agentType>:<agentId>`), `subagent.name` and `subagent.type` (both the agent type, e.g. `Explore`), which feed `agentName` resolution and `buildAgentGraph`.

The parent-to-subagent link is the `.meta.json` sidecar's `toolUseId` (the id of the parent `Agent` tool_use) — the only key unique per invocation, so subagents spawned in parallel (which share a `promptId`) each attach to their own `Agent` call; `promptId` is a lossy fallback for older transcripts. When the parent turn is shipped, the hook records `toolUseId → { traceId, parentSpanId }` in the session state. Subagents then emit against that persisted link, not the live turn window.

Subagents rarely finish flushing before the parent turn is shipped (the final synthesis lands last), so the hook re-reads each subagent file every Stop and emits **incrementally**: each span exactly once, when its content is settled. A call is emitted once a later call closes it; the trailing call and the one-time interaction span are held until the file size is unchanged from the previous Stop, which means the final message has finished flushing. Per-file progress lives in the session state (`emittedCalls`, `interactionEmitted`, `lastSize`, `subDone`).

Emit-once matters because span ids and start times are salted only by stable coordinates (`traceId`, `agentId`, turn/call index), but the two storage paths dedupe differently: the `spans` table is `ReplacingMergeTree(ingested_at)` and would collapse a re-sent span, whereas `traces_mv` (the trace-summary rollup) is a plain per-insert `GROUP BY` with no dedup — re-sending a span there would additively inflate `span_count`, tokens, and cost. Emitting each span once keeps both correct. The trade-off: if a session ends while a subagent's transcript is still growing, its trailing call is not emitted (no worse than before, which dropped the final `llm_request` outright).

## Supported surfaces

| Surface | Works | Why |
| --- | --- | --- |
| CLI | ✅ | Reads `~/.claude/settings.json`, spawns the local hook. |
| Desktop app (Mac/Windows) | ✅ | Shares the same settings file and hook lifecycle. |
| IDE extensions (VS Code, JetBrains) | ✅ | Invoke Claude Code locally under the hood. |
| Web app (`claude.ai/code`) | ❌ | Runs in Anthropic's cloud — no filesystem, no local process. |

## Self-hosted

Point the CLI at your own ingest URL:

```json
{
  "env": {
    "LATITUDE_API_KEY": "lat_xxx",
    "LATITUDE_BASE_URL": "http://localhost:8787"
  }
}
```

## Local development setup

For testing the hook against your local Latitude stack without publishing to npm.

### 1. Build the CLI

```bash
pnpm --filter @latitude-data/claude-code-telemetry build
```

Produces `packages/telemetry/claude-code/dist/index.js`. The dist is pre-built, not live-compiled — rebuild after any source change in `packages/telemetry/claude-code/src/`.

### 2. Point the hook at the local build

In `~/.claude/settings.json`:

```json
{
  "env": {
    "LATITUDE_API_KEY": "lat_seed_default_api_key_token",
    "LATITUDE_PROJECT": "default-project",
    "LATITUDE_BASE_URL": "http://localhost:3002",
    "LATITUDE_DEBUG": "1"
  },
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/ABSOLUTE/PATH/TO/node /Users/<you>/code/latitude/data-llm/packages/telemetry/claude-code/dist/index.js"
          }
        ]
      }
    ]
  }
}
```

Notes on the config:

- `lat_seed_default_api_key_token` + `default-project` are the seed values from `packages/domain/shared/src/seeds.ts`. Run `pnpm seed` first so they exist.
- `LATITUDE_BASE_URL` points at the local `apps/ingest` dev server (port 3002 by default).
- `LATITUDE_DEBUG=1` logs each hook step to stderr.
- **Do not** use `npx -y @latitude-data/claude-code-telemetry` in local dev — that pulls the published package and ignores your local changes.


### 3. Absolute node path (especially for the Desktop app)

GUI-launched apps on macOS get a minimal PATH (`/usr/bin:/bin:/usr/sbin:/sbin`) and don't see `mise` / `nvm` / `volta` / `homebrew`-installed node binaries. The hook command must use an **absolute path** to node:

```bash
which node
# e.g. /Users/<you>/.local/share/mise/installs/node/25.7.0/bin/node
```

Paste that full path into the `command` field. The version-specific path breaks on node upgrades; two alternatives:

- **Shim** — if your node manager provides one (e.g. `~/.local/share/mise/shims/node`), use it; it re-resolves on every call.
- **Login shell wrapper** — `"command": "/bin/bash -lc 'node /path/to/dist/index.js'"`. The `-l` flag sources your profile, which activates mise/nvm. Slightly slower per invocation.

### 4. Verify the hook fired

After any prompt in Claude Code:

```bash
stat -f "%Sm %N" ~/.claude/state/latitude/state.json
cat ~/.claude/state/latitude/state.json
```

A recent `updated` timestamp on the entry for your current session = hook ran. If the file doesn't exist at all, the hook never executed — almost always a wrong node path or missing env var. The CLI exits early without writing state if `LATITUDE_API_KEY` or `LATITUDE_PROJECT` is empty.

### 5. Smoke test without Claude Code

Validate the CLI end-to-end against a synthetic transcript:

```bash
mkdir -p /tmp/latitude-hook-smoke
cat > /tmp/latitude-hook-smoke/transcript.jsonl <<'EOF'
{"type":"user","timestamp":"2026-04-17T12:00:00Z","message":{"role":"user","content":"hello"}}
{"type":"assistant","timestamp":"2026-04-17T12:00:02Z","message":{"id":"msg_1","role":"assistant","model":"claude-sonnet-4-6","content":[{"type":"text","text":"hi"}],"usage":{"input_tokens":5,"output_tokens":2}}}
EOF

rm -f ~/.claude/state/latitude/state.json
echo '{"session_id":"smoke","transcript_path":"/tmp/latitude-hook-smoke/transcript.jsonl"}' \
  | LATITUDE_API_KEY=lat_seed_default_api_key_token \
    LATITUDE_PROJECT=default-project \
    LATITUDE_BASE_URL=http://localhost:3002 \
    LATITUDE_DEBUG=1 \
    node packages/telemetry/claude-code/dist/index.js
```

`HTTP 202` = ingest accepted the payload. The trace appears in the web UI after `apps/workers` processes the queue.

### Debugging table

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| No state file after a session | Hook never ran (PATH issue) | Use an absolute node path |
| State file updates but never a `2xx` line | `LATITUDE_API_KEY` or `LATITUDE_PROJECT` missing | Both must be in settings.json `env` — hooks don't inherit shell env |
| HTTP 400 "X-Latitude-Project header is required" | `LATITUDE_PROJECT` unset | Add it to settings.json |
| HTTP 404 "Project not found" | Slug mismatch or project not in this org | Run `pnpm seed` to create `default-project`; verify org via API key |
| HTTP 401 "Invalid API key" | Wrong token | Seed token is `lat_seed_default_api_key_token` |
| Traces visible but `assistantText` empty | `transcript.ts` regression | Run smoke test + `pnpm --filter @latitude-data/claude-code-telemetry test` |

## Privacy

The hook sends the **full conversation** (prompts, assistant responses, tool I/O) to Latitude on every turn. There is no per-attribute opt-in. Users who need to pause telemetry mid-session can set `LATITUDE_CLAUDE_CODE_ENABLED=0` in their shell.

## Package layout

Source lives at `packages/telemetry/claude-code/`. It is published to npm as `@latitude-data/claude-code-telemetry`. The CLI is invoked via `npx -y @latitude-data/claude-code-telemetry`.

Tests: `pnpm --filter @latitude-data/claude-code-telemetry test`.

Server-side Claude Code span tests: `pnpm --filter @domain/spans test src/otlp/tests/claude-code.test.ts`.
