# @latitude-data/claude-code-telemetry

Claude Code `Stop` hook that streams session transcripts to [Latitude](https://latitude.so) as OTLP traces. Full conversation fidelity — user prompts, assistant responses, and tool I/O — plus the real system prompt and tool definitions that reached the model, without the truncation and flag combinatorics of Claude Code's native OpenTelemetry path.

## Install

```bash
npx -y @latitude-data/claude-code-telemetry install
```

The installer walks you through the setup: prompts for your Latitude API key and project slug, wires the Stop hook into `~/.claude/settings.json`, and — on macOS — sets up `BUN_OPTIONS` via `launchctl` with a persistent `LaunchAgents` plist so the preload works for both terminal `claude` and the Claude Desktop app.

Then fully quit and relaunch claude for the preload to attach:

- **Terminal** — open a new terminal window.
- **Claude Desktop** — ⌘Q to quit, then relaunch from Dock or Finder.

That's it. Trace runs show up at `https://app.latitude.so/projects/<your-slug>`.

### Install flags

| Flag | What it does |
| --- | --- |
| `--api-key=<key>` | Pass the API key instead of being prompted. |
| `--project=<slug>` | Pass the project slug instead of being prompted. |
| `--staging` | Target `https://staging.latitude.so` / `https://staging-ingest.latitude.so`. |
| `--dev` | Target `http://localhost:3000` / `http://localhost:3002`. |
| `--no-launchctl` | Write `BUN_OPTIONS` into `settings.json` instead of setting it via `launchctl`. Useful if you only use terminal claude and don't want anything installed under `~/Library/LaunchAgents/`. |
| `--yes` / `--no-prompt` | Skip all prompts. Required for non-TTY / CI invocations. |

Re-running `install` is idempotent — existing values in `settings.json` are shown as defaults and the Stop hook isn't duplicated.

## Uninstall

```bash
npx -y @latitude-data/claude-code-telemetry uninstall
```

Shows a plan and asks for confirmation before touching anything. Reverses only what the installer did:

- Removes `LATITUDE_*` and (if it's ours) `BUN_OPTIONS` from `~/.claude/settings.json` (backup at `settings.json.latitude-bak`).
- Removes the Stop hook entry — leaves any other hooks alone.
- `launchctl unsetenv BUN_OPTIONS` only if it still points at our preload.
- Unloads and removes `~/Library/LaunchAgents/so.latitude.claude-code-telemetry.plist`.
- Deletes `~/.claude/state/latitude/` (preload, state, captured request files).

## What gets sent

For each turn, the hook emits one trace with three span kinds:

- **`interaction`** — the user prompt and turn-level timing / counts.
- **`llm_request`** — one per model call. Carries the model name, token usage (input/output/cache), input and output messages, and — when the preload is active — the full system prompt (`gen_ai.system_instructions`), tool schemas (`gen_ai.tool.definitions`), and exact request parameters. A tool-loop turn produces N sibling `llm_request` spans, one per distinct assistant `message.id`.
- **`tool_execution`** — one per tool call. Canonical `gen_ai.tool.*` attributes: `name`, `call.id`, `call.arguments`, `call.result`. Failures set `error.type` and OTel status code 2.

All spans share the session id so they group together in the Latitude UI.

## How it works

Two parts, and the installer wires both up:

### 1. Stop hook → OTLP export

Claude Code's `Stop` hook fires at the end of each turn. Our hook reads the new rows of the session's JSONL transcript, reconstructs user → assistant → tool_use → tool_result turns, and POSTs OTLP spans to `${LATITUDE_BASE_URL}/v1/traces`. State lives at `~/.claude/state/latitude/state.json` so each invocation only processes new lines.

This alone gets you conversation-level fidelity. The transcript, however, doesn't contain the system prompt or the tool definitions that reached the model — those are composed by `claude` at runtime and never written to disk.

### 2. Bun `--preload` fetch intercept (optional but installed by default)

The installer ships a small ESM module (`~/.claude/state/latitude/intercept.js`) and wires `BUN_OPTIONS=--preload=<path>` so Bun loads it into the `claude` process. Inside claude, it wraps `globalThis.fetch`, tees the response of every POST to Anthropic's `/v1/messages`, and — the moment the first `message_start` SSE event arrives — writes the full request body to `~/.claude/state/latitude/requests/<message_id>.json`.

The Stop hook then matches those files to their assistant calls by `message_id` and enriches each `llm_request` span with:

- `gen_ai.system_instructions` — the full composed system prompt.
- `gen_ai.tool.definitions` — every tool schema offered to the model.
- `gen_ai.request.model` / `max_tokens` / `temperature` / `top_p` / `stream`.
- `gen_ai.input.messages` — the real message array, overriding the transcript reconstruction.
- `llm_request.captured = "true"` — marker so you can filter for enriched spans.

Request files are deleted after the hook consumes them, and anything older than 24h is swept on each run.

### Why `launchctl` on macOS

Claude Desktop doesn't forward `env` from `~/.claude/settings.json` to the `claude` subprocess it spawns — that field only reaches hook subprocesses. So setting `BUN_OPTIONS` there works for terminal `claude` but is silently ignored by Desktop. `launchctl setenv` puts the var in launchd's environment, which the GUI app inherits. The installer also writes a `LaunchAgents` plist so this survives reboots.

## Configuration reference

Everything the installer writes. Edit `~/.claude/settings.json` directly if you want to tweak:

### `env`

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `LATITUDE_API_KEY` | yes | — | Bearer token for Latitude ingestion. |
| `LATITUDE_PROJECT` | yes | — | Slug of the project to route traces into. |
| `LATITUDE_BASE_URL` | no | `https://ingest.latitude.so` | Override ingest origin. Installer sets this only when you pass `--staging` or `--dev`. |
| `BUN_OPTIONS` | written when `launchctl` isn't used (all non-macOS platforms, or macOS with `--no-launchctl`) | — | `--preload=<absolute-path-to-intercept.js>`. See "how it works" above. |
| `LATITUDE_CLAUDE_CODE_ENABLED` | no | `1` | Set to `0` to pause the hook without uninstalling. |
| `LATITUDE_DEBUG` | no | — | Set to `1` to log diagnostics to stderr. |

### `hooks.Stop`

A single hook entry running `npx -y @latitude-data/claude-code-telemetry` after each turn (async).

### Files on disk

- `~/.claude/state/latitude/intercept.js` — the preload shim `BUN_OPTIONS` points at. Written on every platform.
- `~/.claude/state/latitude/state.json` — per-session bookkeeping (transcript offsets, turn counts) so each hook invocation only processes new lines.
- `~/.claude/state/latitude/requests/<message_id>.json` — request bodies captured by the preload. Transient: consumed by the Stop hook and deleted after each turn.

### macOS-only files

- `~/Library/LaunchAgents/so.latitude.claude-code-telemetry.plist` — a one-shot launchd agent that runs `launchctl setenv BUN_OPTIONS …` on every login. Only installed when you accept the launchctl prompt.

### Manual installation

If the installer doesn't fit your setup (e.g. you manage dotfiles with another tool), the equivalent settings.json is:

```json
{
  "env": {
    "LATITUDE_API_KEY": "lat_xxx",
    "LATITUDE_PROJECT": "my-project-slug"
  },
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npx -y @latitude-data/claude-code-telemetry",
            "async": true
          }
        ]
      }
    ]
  }
}
```

You still need `BUN_OPTIONS=--preload=<abs-path>/intercept.js` in the claude runtime's environment to get the full-request capture. Either run `install` once to materialize the preload and set things up, or copy the shim out of `node_modules/@latitude-data/claude-code-telemetry/dist/intercept.js` and wire it up yourself.

## Privacy

This hook reads your session transcript from disk and sends the **full content** to Latitude — prompts, assistant responses, tool I/O (including file contents returned by `Read`, `Bash` output, etc.). With the preload installed, it also sends Claude Code's system prompt and the list of tool schemas available to the model. There is no per-flag opt-in: the moment the hook is installed, everything gets shipped.

If that's not what you want, either:

- Don't install the hook.
- Set `LATITUDE_CLAUDE_CODE_ENABLED=0` in your shell before starting a sensitive session.
- Run `uninstall`.

## Supported surfaces

| Surface | Works |
| --- | --- |
| CLI (`claude` in terminal) | ✅ |
| Desktop app (macOS / Windows) | ✅ (uses `launchctl` on macOS) |
| IDE extensions (VS Code, JetBrains) | ✅ |
| Web app (`claude.ai/code`) | ❌ — runs in Anthropic's cloud; no local hooks. |

## Caveats

- The `claude` CLI is a Bun-compiled standalone. The preload relies on Bun honoring `BUN_OPTIONS=--preload=...` (verified against 2.1.x). If a future release changes this, the hook falls back to transcript-only reconstruction automatically — spans still work, they just lose `gen_ai.system_instructions` and `gen_ai.tool.definitions`.
- If `BUN_OPTIONS` points at a missing preload file, **`claude` itself will refuse to start** (Bun exits 1). Either keep the file in place or run `uninstall` / remove the env var.
- Captured request bodies are big (50–150KB each). Steady-state disk use is small because the Stop hook prunes them, but long sessions between Stop events can accumulate briefly.

## How it fails

Fail-open by design. If the API is unreachable, your key is wrong, or the transcript is malformed, the hook logs to stderr (when `LATITUDE_DEBUG=1`) and exits `0`. It never blocks Claude from finishing a turn.

## License

MIT
