# @latitude-data/claude-code-telemetry

Claude Code `Stop` hook that streams session transcripts to [Latitude](https://latitude.so) as OTLP traces. Full conversation fidelity — user prompts, assistant responses, and tool I/O — without the truncation and flag combinatorics of Claude Code's native OpenTelemetry path.

## Setup

Add this to your `~/.claude/settings.json`:

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
            "command": "npx -y @latitude-data/claude-code-telemetry"
          }
        ]
      }
    ]
  }
}
```

That's it. The hook fires after every assistant turn, reads new lines from the session transcript, converts them into OTLP traces, and POSTs them to `${LATITUDE_BASE_URL}/v1/traces`.

`LATITUDE_PROJECT` is the slug of the Latitude project you want traces to land in — same value you'd pass in the `X-Latitude-Project` header when using the ingest API directly. The project must already exist under the organization that owns your API key.

## Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `LATITUDE_API_KEY` | yes | — | Bearer token for Latitude ingestion. |
| `LATITUDE_PROJECT` | yes | — | Slug of the project to route traces into. |
| `LATITUDE_BASE_URL` | no | `https://ingest.latitude.so` | Override for self-hosted deploys. |
| `LATITUDE_CLAUDE_CODE_ENABLED` | no | `1` | Set to `0` to turn the hook off without removing it from `settings.json`. |
| `LATITUDE_DEBUG` | no | — | Set to `1` to log diagnostics to stderr. |

## Capturing the full system prompt and tool definitions (optional)

By default the hook reconstructs each `llm_request` span's messages from the transcript on disk. That's good for the conversation — user prompts, assistant text, tool calls and results — but it doesn't include Claude Code's **system prompt** or the **tool definitions** sent to the model, because those aren't persisted to the transcript.

If you want spans to carry the exact payload that reached Anthropic's API — the base prompt, every tool definition, request parameters like `max_tokens` and `temperature`, and the real message array — add a one-time preload that wraps `fetch` inside the `claude` process.

1. Install the preload shim to a stable path:

   ```bash
   npx -y @latitude-data/claude-code-telemetry install
   ```

   This writes `intercept.js` to `~/.claude/state/latitude/intercept.js` and prints the env line to add.

   On macOS, the install command will also offer to wire up `BUN_OPTIONS` via `launchctl` (covering both terminal `claude` and Claude Desktop). Say yes to the prompt and skip step 2.

2. Expose `BUN_OPTIONS` to the `claude` runtime. Either:

   **Option A — add it to `~/.claude/settings.json` under `env`:**
   ```json
   "env": {
     "LATITUDE_API_KEY": "lat_xxx",
     "LATITUDE_PROJECT": "my-project-slug",
     "BUN_OPTIONS": "--preload=/Users/you/.claude/state/latitude/intercept.js"
   }
   ```

   **Option B — export in your shell rc** (`~/.zshrc`, `~/.bashrc`):
   ```bash
   export BUN_OPTIONS="--preload=/Users/you/.claude/state/latitude/intercept.js"
   ```

   Use the absolute path printed by `install` — `~` isn't expanded inside these values.

3. **Open a new terminal** (or restart your shell) so the env var takes effect, then start a new claude session.

With this in place, every Anthropic `/v1/messages` request body is written to `~/.claude/state/latitude/requests/<message_id>.json` inside the `claude` process and consumed by the Stop hook, which attaches:

- `gen_ai.system_instructions` — the full system prompt (base + CLAUDE.md + any billing/context blocks)
- `gen_ai.tool.definitions` — every tool schema offered to the model
- `gen_ai.request.model` / `max_tokens` / `temperature` / `top_p` / `stream`
- `gen_ai.input.messages` — the real message array, overriding the transcript reconstruction
- `llm_request.captured = "true"` — marker so you can filter for enriched spans

Request files are pruned after the Stop hook consumes them, and anything older than 24h is swept on each run.

### Using Claude Desktop (GUI) on macOS

`BUN_OPTIONS` in `settings.json` and shell rc exports **do not reach the `claude` runtime** when claude is spawned by the Claude Desktop app — the GUI app doesn't forward `settings.json.env` to the claude subprocess, and GUI apps don't inherit shell rc. The workaround is to set it at macOS's launchd layer, which Claude Desktop (and terminal claude, and everything else you launch from the GUI) inherits:

```bash
launchctl setenv BUN_OPTIONS "--preload=/Users/you/.claude/state/latitude/intercept.js"
```

Then **fully quit Claude Desktop** (⌘Q) and relaunch from Finder/Dock.

`launchctl setenv` resets on reboot. To persist it, save this as `~/Library/LaunchAgents/so.latitude.claude-code-telemetry.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>so.latitude.claude-code-telemetry</string>
  <key>ProgramArguments</key>
  <array>
    <string>launchctl</string>
    <string>setenv</string>
    <string>BUN_OPTIONS</string>
    <string>--preload=/Users/you/.claude/state/latitude/intercept.js</string>
  </array>
  <key>RunAtLoad</key><true/>
</dict></plist>
```

Then `launchctl load ~/Library/LaunchAgents/so.latitude.claude-code-telemetry.plist`.

The `install` command can do all of this for you — run it on macOS and say yes to the launchctl prompt.

### Uninstalling

To remove everything this package configured:

```bash
npx -y @latitude-data/claude-code-telemetry uninstall
```

The uninstall command shows a plan and asks for confirmation before touching anything. It reverses only what the install touched:

- Removes `LATITUDE_API_KEY` / `LATITUDE_PROJECT` / `LATITUDE_BASE_URL` / `BUN_OPTIONS` from `~/.claude/settings.json` (backs up to `settings.json.latitude-bak` first).
- Removes our Stop hook entry from `settings.json` — leaves any other hooks alone.
- If `launchctl` has `BUN_OPTIONS` pointing at our preload, `unsetenv`s it; leaves any other value alone.
- Removes the LaunchAgents plist if present.
- Deletes `~/.claude/state/latitude/` (preload, state, captured request files).

### Setup walkthrough

A one-shot interactive installer covers everything above:

```bash
npx -y @latitude-data/claude-code-telemetry install
```

It prompts for your `LATITUDE_API_KEY`, project slug, and base URL, writes them to `settings.json` with the Stop hook entry, and — on macOS — offers to set `BUN_OPTIONS` via `launchctl` with persistent `LaunchAgents` wiring. Existing values in `settings.json` are shown as defaults; press Enter to keep them. A backup is always written first. Use `--yes` to accept all defaults non-interactively, or `--no-prompt` for CI.

**Caveats:**
- The `claude` CLI is a Bun-compiled standalone. The preload relies on Bun honoring `BUN_OPTIONS=--preload=...` (verified against 2.1.x). If a future release removes this, the hook falls back to reconstruction automatically — nothing else breaks.
- If the preload path is missing or invalid, **`claude` itself will refuse to start** (Bun errors out). Either keep the path in place or remove `BUN_OPTIONS` from your env.
- Request bodies are big (often 100KB+ per call). Steady-state disk is small because the Stop hook prunes them, but sessions with many turns between Stop events will accumulate briefly.

## What gets sent

For each turn, the hook emits:

- One `interaction` span — the user prompt.
- One `llm_request` span — model, token usage (input/output/cache), and the full assistant response.
- One `tool_execution` span per tool call — tool name, input, output.

All spans carry `session.id` so they group into a single session in the Latitude UI. State lives in `~/.claude/state/latitude/state.json` so each invocation only processes new transcript lines.

## Privacy

This hook reads your session transcript from disk and sends the **full content** to Latitude — prompts, assistant responses, and tool I/O (including file contents returned by `Read`, `Bash` output, etc.). There is no per-flag opt-in: the moment the hook is installed, everything gets shipped.

If that's not what you want, either:
- Don't install the hook.
- Set `LATITUDE_CLAUDE_CODE_ENABLED=0` in your shell before starting a sensitive session.

## Supported surfaces

| Surface | Works |
| --- | --- |
| CLI (`claude` in terminal) | ✅ |
| Desktop app (Mac/Windows) | ✅ |
| IDE extensions (VS Code, JetBrains) | ✅ |
| Web app (`claude.ai/code`) | ❌ — runs in Anthropic's cloud; no local hooks. |

## How it fails

The hook is fail-open by design. If the API is unreachable, your key is wrong, or the transcript is malformed, the hook logs to stderr (when `LATITUDE_DEBUG=1`) and exits `0`. It never blocks Claude from finishing a turn.

## License

MIT
