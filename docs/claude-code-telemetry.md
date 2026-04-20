# Claude Code telemetry

Latitude ingests Claude Code sessions via a `Stop` hook that ships the full session transcript as OTLP traces. This page covers the user-facing integration. For the architectural rationale (hooks vs. native OTEL), see [`prd/claude-code-telemetry.md`](../prd/claude-code-telemetry.md).

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
            "command": "npx -y @latitude-data/claude-code-telemetry",
          }
        ]
      }
    ]
  }
}
```

The hook runs on every assistant-turn completion. It reads **new** lines from the session transcript since the last run (state is tracked at `~/.claude/state/latitude/state.json`), converts them into OTLP spans, and POSTs to `${LATITUDE_BASE_URL}/v1/traces` with `Authorization: Bearer ${LATITUDE_API_KEY}` and `X-Latitude-Project: ${LATITUDE_PROJECT}`. The project must already exist under the organization that owns the API key.

## Ingestion shape

Each turn produces three kinds of spans, all routed through the existing `apps/ingest` OTLP endpoint:

| `span.type` | Maps to `Operation` | Carries |
| --- | --- | --- |
| `interaction` | `prompt` | Root of the turn. `user_prompt`, `session.id`, `interaction.duration_ms`. |
| `llm_request` | `chat` | Child of interaction. `model`, token counts (input/output/cache_read/cache_creation), `gen_ai.input.messages`, `gen_ai.output.messages` (full conversation as JSON). |
| `tool_execution` | `execute_tool` | Child of llm_request, one per tool call. `tool.name`, `tool.id`, `tool.input`, `tool.output`. |

Server-side routing lives in `packages/domain/spans/src/otlp/resolvers/operation.ts` (`CLAUDE_CODE_OPERATION` map) and `packages/domain/spans/src/otlp/content/claude-code.ts`. The `gen_ai.input.messages` / `gen_ai.output.messages` attributes are parsed by the generic `parseGenAICurrent` parser, which takes precedence over `parseClaudeCode`.

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
