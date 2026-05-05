# OpenClaw telemetry

Stream your OpenClaw agent runs: system prompts, message history, assistant responses, tool I/O, token usage, and the running agent's name into Latitude as OpenTelemetry traces. Once installed, every agent run shows up in your project's **Traces** view, with subagent spawn trees nested into a single waterfall.

## Prerequisites

- A free [Latitude account](https://console.latitude.so/login) with at least one project
- **OpenClaw 2026.4.25 or newer** on your `PATH` (run `npm install -g openclaw@latest` to upgrade)
- Node.js available on your `PATH` (the CLI runs via `npx`)

## Step 1: Get your Latitude API key and project slug

You'll need both before running the installer.

**Project slug**: open your project in Latitude. The slug appears in the left sidebar, directly under the project name. Click it to copy.

**API key**: go to **Settings → API Keys** (top-right of the Latitude app). Use an existing key or click **Create API Key**. Copy the full key value.

## Step 2: Run the installer

In a terminal, run:

```bash
npx -y @latitude-data/openclaw-telemetry-cli@0.0.7 install
```

The installer will:

1. Prompt for your API key and project slug (paste the values from Step 1).
2. Run `openclaw plugins install @latitude-data/openclaw-telemetry@0.0.7` to fetch and scan the plugin.
3. Write the plugin entry into `~/.openclaw/openclaw.json` (API key, project slug, both `allowConversationAccess` flags, and `enabled: true`).
4. Add the plugin to `plugins.allow` so OpenClaw stops warning about it on every restart.
5. Run `openclaw config validate` to confirm the config parses cleanly.
6. On a TTY, offer to restart the gateway for you.

If you'd rather pass values as flags instead of being prompted:

```bash
npx -y @latitude-data/openclaw-telemetry-cli@0.0.7 install \
  --api-key=lat_xxx \
  --project=your-project-slug \
  --yes
```

See [Install flags](#install-flags) below for all available flags.

## Step 3: Restart the gateway

If you didn't let the installer do it for you:

```bash
openclaw gateway restart
```

## Step 4: Verify traces are arriving

Send a message to one of your OpenClaw agents. Then open your Latitude project and go to **Traces**. Within a few seconds the new trace should appear.

You can also tail the gateway log to confirm the plugin loaded:

```bash
grep -E "blocked|plugin not found|latitude" /tmp/openclaw/openclaw-*.log | tail
```

You should see a `ready (N plugins: ..., @latitude-data/openclaw-telemetry, ...)` line and **no** `blocked` or `plugin not found` lines.

If nothing shows up, see [Troubleshooting](#troubleshooting) below.

## Structural-only telemetry (no content capture)

If you want trace metadata — timings, token usage, model name, agent name, structural ids — without sending prompt or response content, install with `--no-content`:

```bash
npx -y @latitude-data/openclaw-telemetry-cli@0.0.7 install --no-content
```

Spans still appear in Latitude with the full tree, but content attributes (`gen_ai.input.messages`, `gen_ai.output.messages`, `gen_ai.system_instructions`, tool args/results) are scrubbed. Each span carries `latitude.captured.content: false` so the gate state is visible in the UI.

To switch an existing install: see [Manual configuration](#manual-configuration) below — set `config.allowConversationAccess` to `false` while keeping `hooks.allowConversationAccess` at `true`.

## Disabling temporarily

To pause emission without uninstalling, set the env var on the gateway process:

```bash
export LATITUDE_OPENCLAW_ENABLED=0
```

Restart the gateway for the change to take effect. Set it back to `1` (or unset it) to re-enable. Alternatively, edit `~/.openclaw/openclaw.json` and set `plugins.entries["@latitude-data/openclaw-telemetry"].enabled` to `false`.

## Uninstalling

To remove the plugin and revert all changes the installer made:

```bash
npx -y @latitude-data/openclaw-telemetry-cli@0.0.7 uninstall
```

Or manually:

```bash
openclaw plugins uninstall @latitude-data/openclaw-telemetry --force
openclaw gateway restart
```

OpenClaw removes the extension files, install record, plugin entry, and the `plugins.allow` entry.

## Manual configuration

If you'd rather not run the CLI, do exactly what it does in four steps.

### 1. Install the runtime

```bash
openclaw plugins install @latitude-data/openclaw-telemetry@0.0.7
```

Pin to an exact version. OpenClaw's `security audit --deep` warns about unpinned install specs.

### 2. Configure and enable

Use bracket notation so the scoped package name parses correctly. Substitute your real API key and project slug:

```bash
openclaw config set 'plugins.entries["@latitude-data/openclaw-telemetry"].config.apiKey' "lat_xxx"
openclaw config set 'plugins.entries["@latitude-data/openclaw-telemetry"].config.project' "your-project-slug"
openclaw config set 'plugins.entries["@latitude-data/openclaw-telemetry"].config.allowConversationAccess' true
openclaw config set 'plugins.entries["@latitude-data/openclaw-telemetry"].hooks.allowConversationAccess' true
openclaw config set 'plugins.entries["@latitude-data/openclaw-telemetry"].enabled' true
```

Both `allowConversationAccess` writes are required — see [The two flags](#the-two-flags) below.

### 3. Add to `plugins.allow`

Silence OpenClaw's warning about non-bundled plugins loading without provenance. `config set` can't append to arrays, so include any other plugins you already have in `plugins.allow`:

```bash
openclaw config set 'plugins.allow' '["@latitude-data/openclaw-telemetry"]'
```

### 4. Restart and verify

```bash
openclaw gateway restart
openclaw config validate --json
# → {"valid": true, ...}
```

### Or: hand-edit `~/.openclaw/openclaw.json`

Equivalent to steps 2 + 3 in one paste:

```json
{
  "plugins": {
    "allow": ["@latitude-data/openclaw-telemetry"],
    "entries": {
      "@latitude-data/openclaw-telemetry": {
        "enabled": true,
        "hooks": {
          "allowConversationAccess": true
        },
        "config": {
          "apiKey": "lat_xxx",
          "project": "your-project-slug",
          "allowConversationAccess": true
        }
      }
    }
  }
}
```

Merge with whatever else lives in `openclaw.json`, then run `openclaw config validate` and `openclaw gateway restart`.

## Reference

### CLI commands

The CLI exposes two subcommands:

- `install` — installs the plugin runtime, writes config to `~/.openclaw/openclaw.json`, registers it in `plugins.allow`, validates, and (on TTY) restarts the gateway.
- `uninstall` — reverts every change `install` made, after confirmation.

### Install flags

| Flag | Purpose |
|---|---|
| `--api-key=<key>` | Supply the Latitude API key non-interactively. |
| `--project=<slug>` | Supply the Latitude project slug non-interactively. |
| `--no-content` | Configure structural-only telemetry. Spans emit normally but message and tool content are scrubbed. |
| `--staging` | Point the plugin at the Latitude staging environment instead of production. |
| `--dev` | Point the plugin at `localhost` (for Latitude internal development). |
| `--yes`, `--no-prompt` | Skip all interactive prompts. Useful in CI or scripted setups. |

The full flag matrix (dry-run mode, custom config dir) lives in the [CLI README](https://github.com/latitude-dev/latitude-llm/tree/main/packages/telemetry/openclaw-cli#readme).

### Configuration keys

Two blocks live under `plugins.entries["@latitude-data/openclaw-telemetry"]`.

**`.config`** — read by the plugin's runtime:

| Key | Required | Default | Purpose |
|---|---|---|---|
| `apiKey` | Yes | — | Bearer token for Latitude ingestion. |
| `project` | Yes | — | Slug of the project to route traces into. |
| `baseUrl` | No | `https://ingest.latitude.so` | Override the OTLP ingest origin. The CLI sets this only when `--staging` or `--dev` is passed. |
| `allowConversationAccess` | No | `false` | When `true`, attach raw prompts, assistant responses, system instructions, and tool I/O to spans. When `false`, emit only timings, token usage, model name, agent id, and structural ids. **Must be paired with `hooks.allowConversationAccess` — see [The two flags](#the-two-flags).** |
| `enabled` | No | `true` | Set to `false` to pause emission without uninstalling. |
| `debug` | No | `false` | Log diagnostic lines to stderr (visible in the gateway log). |

**`.hooks`** — read by OpenClaw's runtime:

| Key | Required | Default | Purpose |
|---|---|---|---|
| `allowConversationAccess` | Yes (on 2026.4.25+) | — | OpenClaw's hook dispatcher gates `llm_input` / `llm_output` / `before_tool_call` / `after_tool_call` / `agent_end` events on this. When `false` or absent, every typed hook is blocked and the plugin never sees an event. |

### The two flags

`hooks.allowConversationAccess` and `config.allowConversationAccess` mean different things:

- **`hooks.*`** is the **dispatch gate**. `false` → OpenClaw never forwards events to the plugin. No traces.
- **`config.*`** is the **payload-content gate**. `false` → the plugin emits spans normally but scrubs message content from them. Structural-only telemetry.

The CLI always writes both from the same source. If you hand-edit:

- **Both `true`**: full content capture (the default).
- `hooks: true` + `config: false`: structural-only telemetry (equivalent to `--no-content`).
- `hooks: false` + anything: no traces. Don't.

### Environment variables

If a `config.*` key isn't set in `openclaw.json`, the plugin falls back to env vars on the gateway process:

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `LATITUDE_API_KEY` | Conditional | — | Fallback for `config.apiKey`. |
| `LATITUDE_PROJECT` | Conditional | — | Fallback for `config.project`. |
| `LATITUDE_BASE_URL` | No | `https://ingest.latitude.so` | Fallback for `config.baseUrl`. |
| `LATITUDE_DEBUG` | No | unset | Set to `1` to print diagnostic output to stderr. |
| `LATITUDE_OPENCLAW_ENABLED` | No | `1` | Set to `0` to disable emission without uninstalling. |

### Files modified by the installer

- **`~/.openclaw/openclaw.json`** — adds the plugin to `plugins.allow` and writes the full `plugins.entries["@latitude-data/openclaw-telemetry"]` block. Existing settings are preserved.
- **`~/.openclaw/extensions/@latitude-data/openclaw-telemetry/`** — the runtime plugin files, fetched from npm by `openclaw plugins install`.

The installer does not modify your shell rc files (`.zshrc`, `.bashrc`).

## How it works

The plugin subscribes to OpenClaw's typed plugin hooks and emits one OTel span per paired before/after event. Hooks run fire-and-forget, so telemetry can never slow down the agent loop.

For each agent run, the plugin emits one trace shaped like the run itself:

```
agent (root, traceId = hash(runId))
├─ compaction         (rare; budget-triggered)
├─ model_call         (one per provider API call)
├─ tool_call: foo     (between model_calls)
├─ model_call
├─ tool_call: bar
├─ subagent           (the child's full agent tree nests under here)
│   └─ agent
│       ├─ model_call
│       └─ tool_call: ...
└─ model_call         (final)
```

Five span kinds:

- **`agent`** — root of the run. Carries `openclaw.session.key`, `openclaw.agent.id`, `openclaw.agent.name`, aggregated token usage, run duration, success/error status, the first user prompt, and the final message list.
- **`model_call`** — one per provider API call. Carries provider, request/response model, transport, per-call duration, error category, time-to-first-byte, payload bytes, upstream request id hash, and `gen_ai.input.messages` snapshotted at generation start.
- **`tool_call:<name>`** — one per tool invocation, with canonical `gen_ai.tool.*` attributes (`name`, `call.id`, `call.arguments`, `call.result`). Sibling of `agent`, not child of `model_call` — tools run between generations, not during them.
- **`compaction`** — fires when OpenClaw hits the message budget mid-run.
- **`subagent`** — one per child run spawned by this agent. The child's entire `agent` subtree (its own `model_call`s, `tool_call`s, even further-nested `subagent`s) parents under it via cross-runId trace propagation, so a spawn tree is one waterfall in one trace.

Every span carries `openclaw.agent.id` and `openclaw.agent.name`, so multi-agent setups can be filtered and grouped by agent in the Latitude UI.

The plugin is **fail-open**. If the API is unreachable, your key is wrong, or a hook payload is malformed, it logs to stderr (when `debug: true`) and the agent run continues unaffected.

### Backend caveat: Codex / Claude-Code-style providers

OpenClaw's `model_call_started` / `model_call_ended` hooks fire from its `selection` layer, which wraps the agent's `streamFn` invocation. For "agentic" backends (Codex, Claude Code) the inner generations happen inside the backend's own loop and don't surface as separate `model_call` events. As a result, a Codex-backed run shows **one** `model_call` per attempt instead of N. Anthropic and OpenAI direct don't have this issue. The fix is upstream in OpenClaw.

## Privacy

The CLI's first-install default writes `allowConversationAccess: true` to both blocks → full content capture. Latitude receives the verbatim content of every run: prompts, responses, system instructions, tool I/O.

- **Structural-only mode** is available via `--no-content` (or hand-editing the two flags).
- **No per-run opt-in.** Every run is captured until the plugin is disabled.
- **No redaction.** If a secret reaches the agent, it reaches Latitude.
- **Disable globally.** Set `LATITUDE_OPENCLAW_ENABLED=0` on the gateway, set `enabled: false` in the plugin entry, or run `uninstall`.

For hand-edited configs, leaving `allowConversationAccess` out entirely produces **no traces** (not "structural-only traces") — `hooks.allowConversationAccess` defaults to `false` at OpenClaw's level and dispatch is blocked. Always set both keys explicitly.

If you're working with sensitive material, switch to structural-only mode or disable the plugin **before** the run.

## Supported OpenClaw versions

Requires **2026.4.25 or newer**. Earlier versions either reject `hooks.allowConversationAccess` outright (≤ 2026.4.21) or have unverified dispatch gating (2026.4.22 – 2026.4.24). The CLI aborts on older versions; manual installs run into validation errors. Run `npm install -g openclaw@latest` to upgrade.

## Troubleshooting

**No traces appear in Latitude.**
Confirm the gateway was restarted after install. Then check the gateway log:

```bash
grep -E "blocked|plugin not found|latitude" /tmp/openclaw/openclaw-*.log | tail
```

A `blocked` line means `hooks.allowConversationAccess` is `false` or missing — re-run `install`, or set both flags as shown in [Manual configuration](#manual-configuration). A `plugin not found` line means the runtime didn't install — re-run `openclaw plugins install @latitude-data/openclaw-telemetry@0.0.7`.

If the log looks clean, set `LATITUDE_DEBUG=1` on the gateway and trigger another run; the plugin will print diagnostic output explaining why the upload didn't happen (most often a wrong API key, wrong project slug, or unreachable network).

**Spans show timings but no message content.**
You're in structural-only mode. Set `config.allowConversationAccess` to `true` (keeping `hooks.allowConversationAccess` at `true`) and restart the gateway.

**Codex- or Claude-Code-backed agents show one `model_call` per attempt instead of N.**
Expected — see [Backend caveat](#backend-caveat-codex--claude-code-style-providers) above.

**Gateway warns about non-bundled plugins on every restart.**
The plugin isn't in `plugins.allow`. Run:

```bash
openclaw config set 'plugins.allow' '["@latitude-data/openclaw-telemetry"]'
```

(Include any other plugins you already had in the array — `config set` can't append.)

**`openclaw config validate` fails after manual install.**
Most likely a missing `hooks.allowConversationAccess` write or a quoting issue with the bracket-notation paths. Compare your `~/.openclaw/openclaw.json` against the [hand-edit template](#or-hand-edit-openclawopenclawjson) above.

## License

MIT. Source code lives at [`latitude-dev/latitude-llm`](https://github.com/latitude-dev/latitude-llm/tree/main/packages/telemetry/openclaw).
