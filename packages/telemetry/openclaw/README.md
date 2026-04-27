# @latitude-data/openclaw-telemetry

OpenClaw plugin that streams every agent run to [Latitude](https://latitude.so) as OTLP traces. Full fidelity — exact system prompt, message history, assistant output, token usage, tool I/O, and the running agent's name on every span.

## Install

```bash
npx -y @latitude-data/openclaw-telemetry install
```

The installer prompts for your Latitude API key and project slug, then:

1. Materializes the plugin's runtime files into `~/.openclaw/extensions/latitude-telemetry/` (where OpenClaw's plugin discovery scans).
2. Writes the plugin entry to `~/.openclaw/openclaw.json` under `plugins.entries["@latitude-data/openclaw-telemetry"].config` — credentials, base URL, and the `allowConversationAccess` flag all live here.

Restart the OpenClaw gateway after install:

```bash
openclaw gateway restart
```

That's it. Traces show up at `https://console.latitude.so/projects/<your-slug>`.

### Install flags

| Flag | What it does |
| --- | --- |
| `--api-key=<key>` | Pass the API key instead of being prompted. |
| `--project=<slug>` | Pass the project slug instead of being prompted. |
| `--staging` | Target `https://staging.latitude.so` / `https://staging-ingest.latitude.so`. |
| `--dev` | Target `http://localhost:3000` / `http://localhost:3002`. |
| `--yes` / `--no-prompt` | Skip all prompts. Required for non-TTY / CI invocations. |
| `--no-content` | Skip raw prompt/response/tool I/O capture. Spans still emit with timing, token usage, model name, and ids. |

Re-running `install` is idempotent — existing values are preserved.

## Uninstall

```bash
npx -y @latitude-data/openclaw-telemetry uninstall
```

Shows a plan, asks for confirmation, then removes the plugin entry from `~/.openclaw/openclaw.json` and the materialized files at `~/.openclaw/extensions/latitude-telemetry/`. A backup of the settings file is saved at `openclaw.json.latitude-bak`.

## What gets sent

For each agent run, the plugin emits one trace with three span kinds:

- **`interaction`** — the agent run. Carries `openclaw.session.key`, `openclaw.agent.id`, `openclaw.agent.name`, aggregated token usage across all LLM calls, run duration, success/error status, and the first user prompt.
- **`llm_request`** — one per LLM call. Carries provider, request/response model, `gen_ai.system_instructions`, `gen_ai.input.messages` (full history + current prompt), `gen_ai.output.messages` (assistant text + tool_call parts), and full token usage (input/output/cache_read/cache_creation/total) — under both canonical `gen_ai.*` keys and legacy aliases.
- **`tool_execution`** — one per tool call. Canonical `gen_ai.tool.*` attributes: `name`, `call.id`, `call.arguments`, `call.result`. Failures set `error.type`, `error.message`, and OTel status code 2.

Every span carries `openclaw.agent.id` and `openclaw.agent.name`. Multi-agent OpenClaw setups (sub-agents) naturally produce spans tagged with the invoking agent's id, letting you filter and group by agent in the Latitude UI.

All spans share the run id and trace id so they group together.

## How it works

OpenClaw ships typed plugin hooks that fire per-LLM-call with the complete payload (`src/plugins/hook-types.ts` in the OpenClaw source). We subscribe to:

- `llm_input` — full system prompt, prompt text, history messages, provider, model.
- `llm_output` — assistant text, last assistant message, full token usage (input/output/cacheRead/cacheWrite/total), resolved provider/model ref.
- `before_tool_call` / `after_tool_call` — tool name, arguments, result, error, duration.
- `agent_end` — run completion signal. This is when we build the OTLP trace and POST it.
- `session_start` — currently a no-op; reserved for future session-level metadata.

OpenClaw runs LLM hooks **fire-and-forget** (see [`src/plugins/hooks.ts`](https://github.com/openclaw/openclaw/blob/main/src/plugins/hooks.ts) — `runLlmInput`/`runLlmOutput` are documented as parallel, and the call site in [`src/agents/pi-embedded-runner/run/attempt.ts`](https://github.com/openclaw/openclaw/blob/main/src/agents/pi-embedded-runner/run/attempt.ts) wraps them with `void hookRunner.run*(...).catch(...)`). Our handlers can never slow down the agent loop.

**No runtime wrapping.** Unlike existing third-party OpenClaw observability plugins that try to monkey-patch `@mariozechner/pi-ai` (and run into jiti's CJS/ESM module isolation), we stay inside the supported plugin API. The hooks give us everything, at lower risk of breaking on OpenClaw updates.

## Configuration reference

The installer writes the plugin entry under `plugins.entries[id].config`. Every key is optional except `apiKey` and `project`. You can hand-edit `~/.openclaw/openclaw.json` to tweak:

### `plugins.entries["@latitude-data/openclaw-telemetry"].config`

| Key | Required | Default | Description |
| --- | --- | --- | --- |
| `apiKey` | yes | — | Bearer token for Latitude ingestion. |
| `project` | yes | — | Slug of the project to route traces into. |
| `baseUrl` | no | `https://ingest.latitude.so` | Override OTLP ingest origin. Installer sets this only when you pass `--staging` or `--dev`. |
| `allowConversationAccess` | no | `false` | When `true`, attach raw prompts, assistant responses, system instructions, and tool I/O to spans. When `false`, emit only timing, token usage, model name, agent id, and structural ids — same span tree, scrubbed payloads. |
| `enabled` | no | `true` | Set to `false` to pause emission without uninstalling. |
| `debug` | no | `false` | Log diagnostic lines to stderr (visible in the gateway log). |

### Environment variable fallbacks

If a key isn't set in `config`, the runtime falls back to environment variables on the gateway process. `LATITUDE_API_KEY`, `LATITUDE_PROJECT`, `LATITUDE_BASE_URL`, `LATITUDE_DEBUG`, and `LATITUDE_OPENCLAW_ENABLED` are all read this way. The installer doesn't set them — pluginConfig is the canonical surface — but they're useful for kicking debug on/off without editing `openclaw.json`.

### Manual installation

If the installer doesn't fit your setup, you need two things:

1. **The plugin files** under a directory OpenClaw discovers (`~/.openclaw/extensions/<name>/` or any path listed in `plugins.load.paths`). The directory must contain at minimum `openclaw.plugin.json` and the compiled `dist/plugin.js`. Easiest: copy them out of the installed `node_modules/@latitude-data/openclaw-telemetry/`.
2. **The plugin entry** in `~/.openclaw/openclaw.json`:

```jsonc
{
  "plugins": {
    "entries": {
      "@latitude-data/openclaw-telemetry": {
        "enabled": true,
        "config": {
          "apiKey": "lat_xxx",
          "project": "my-openclaw-project",
          "allowConversationAccess": true
        }
      }
    }
  }
}
```

Don't put `LATITUDE_*` keys at top-level `env` — OpenClaw's strict zod schema rejects them. Don't put `allowConversationAccess` under `hooks` either — that field is OpenClaw's strict reserved namespace and only accepts `allowPromptInjection` (older versions) or `allowPromptInjection` + `allowConversationAccess` (2026.4.22+). Our config bucket is `plugins.entries[id].config`, which is `record(string, unknown)` and accepted across all versions.

After editing, run `openclaw config validate` — it should print `valid: true`. Then `openclaw gateway restart`.

## Privacy

By default we emit **structural telemetry only** — span tree, timings, token usage, model name, agent name, run/session ids — but **no prompt or response content**. You opt in to content capture by setting `allowConversationAccess: true` (the default the interactive installer writes).

When `allowConversationAccess` is on, every LLM call's full input messages, assistant output, system instructions, and tool I/O are attached to spans. Pass `--no-content` to the installer (or set the flag to `false` in `openclaw.json`) if you want telemetry without payloads.

To pause emission entirely without uninstalling, set `LATITUDE_OPENCLAW_ENABLED=0` in the gateway environment.

## Supported OpenClaw versions

Requires OpenClaw **2026.3.0+** for the `llm_input` / `llm_output` hooks. Older versions lack these hooks and would only surface metadata via `model.usage` diagnostics — not enough for full trace fidelity.

## How it fails

Fail-open by design. If the API is unreachable, your key is wrong, or a hook payload is malformed, the plugin logs to stderr (when `LATITUDE_DEBUG=1`) and the agent run continues unaffected.

## License

MIT
