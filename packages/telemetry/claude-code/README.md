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
