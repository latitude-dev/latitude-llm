# @latitude-data/openclaw-telemetry

OpenClaw plugin that streams every agent run to [Latitude](https://latitude.so) as OTLP traces. Full fidelity — exact system prompt, message history, assistant output, token usage, tool I/O, and the running agent's name on every span.

## Install

```bash
npx -y @latitude-data/openclaw-telemetry install
```

The installer prompts for your Latitude API key and project slug, then writes a plugin entry to `~/.openclaw/openclaw.json` with `hooks.allowConversationAccess: true` so OpenClaw forwards raw conversation content to our handlers.

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

Re-running `install` is idempotent — existing values are preserved.

## Uninstall

```bash
npx -y @latitude-data/openclaw-telemetry uninstall
```

Shows a plan, asks for confirmation, then removes the plugin entry and the `LATITUDE_*` env vars from `~/.openclaw/openclaw.json`. A backup is saved at `openclaw.json.latitude-bak`.

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

Everything the installer writes. You can edit `~/.openclaw/openclaw.json` directly if you want to tweak:

### `env`

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `LATITUDE_API_KEY` | yes | — | Bearer token for Latitude ingestion. |
| `LATITUDE_PROJECT` | yes | — | Slug of the project to route traces into. |
| `LATITUDE_BASE_URL` | no | `https://ingest.latitude.so` | Override ingest origin. Installer sets this only when you pass `--staging` or `--dev`. |
| `LATITUDE_OPENCLAW_ENABLED` | no | `1` | Set to `0` to pause the plugin without uninstalling. |
| `LATITUDE_DEBUG` | no | — | Set to `1` to log diagnostics to stderr. |

### `plugins.entries`

```json
{
  "@latitude-data/openclaw-telemetry": {
    "enabled": true,
    "hooks": {
      "allowConversationAccess": true
    }
  }
}
```

`allowConversationAccess` is load-bearing — OpenClaw scrubs payloads from `llm_input` / `llm_output` / `agent_end` for third-party plugins unless they opt in explicitly.

### Manual installation

If the installer doesn't fit your setup, the equivalent `openclaw.json` is:

```jsonc
{
  "env": {
    "LATITUDE_API_KEY": "lat_xxx",
    "LATITUDE_PROJECT": "my-openclaw-project"
  },
  "plugins": {
    "entries": {
      "@latitude-data/openclaw-telemetry": {
        "enabled": true,
        "hooks": {
          "allowConversationAccess": true
        }
      }
    }
  }
}
```

Then ensure the package is installed where OpenClaw can load it (either in your OpenClaw workspace, or globally via `npm i -g @latitude-data/openclaw-telemetry`).

## Privacy

This plugin reads every LLM input and output and sends the **full content** to Latitude — system prompts, user prompts, assistant responses, tool I/O. There is no per-flag opt-in once `allowConversationAccess` is set: everything gets shipped.

If that's not what you want:

- Don't install the plugin.
- Set `LATITUDE_OPENCLAW_ENABLED=0` in your shell before starting a sensitive session.
- Run `uninstall`.

## Supported OpenClaw versions

Requires OpenClaw **2026.3.0+** for the `llm_input` / `llm_output` hooks. Older versions lack these hooks and would only surface metadata via `model.usage` diagnostics — not enough for full trace fidelity.

## How it fails

Fail-open by design. If the API is unreachable, your key is wrong, or a hook payload is malformed, the plugin logs to stderr (when `LATITUDE_DEBUG=1`) and the agent run continues unaffected.

## License

MIT
