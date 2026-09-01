# Claude Code telemetry

Stream Claude Code conversations into Latitude as traces. After setup, Claude Code turns appear in your project's **Traces** view with prompts, responses, tool calls, and tool results.

## Prerequisites

- A [Latitude account](https://console.latitude.so/login) with a project
- Claude Code installed locally
- Node.js available on your `PATH`

<Note>
  This integration works with local Claude Code surfaces that support hooks, including the CLI, desktop app, and IDE extensions. It does not run inside the hosted Claude web app.
</Note>

## Install

1. In Latitude, copy your project slug from the project sidebar.
2. Create or copy an API key from **Settings → API Keys**.
3. Run the installer:

```bash
npx -y @latitude-data/claude-code-telemetry@latest install
```

The installer prompts for your API key and project slug, then configures Claude Code to export telemetry after each turn.

You can also pass values directly:

```bash
npx -y @latitude-data/claude-code-telemetry@latest install \
  --api-key=lat_xxx \
  --project=your-project-slug \
  --yes
```

## Restart and verify

Fully quit and relaunch Claude Code, then run any prompt. Open your Latitude project and go to **Traces**. The new trace should appear within a few seconds.

## Disable or uninstall

To pause telemetry temporarily:

```bash
export LATITUDE_CLAUDE_CODE_ENABLED=0
```

Restart Claude Code for the change to take effect.

To remove the integration:

```bash
npx -y @latitude-data/claude-code-telemetry@latest uninstall
```

## Manual configuration

If you manage Claude Code settings yourself, add the telemetry command to `~/.claude/settings.json`:

```json
{
  "env": {
    "LATITUDE_API_KEY": "lat_xxx",
    "LATITUDE_PROJECT": "your-project-slug"
  },
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npx -y @latitude-data/claude-code-telemetry@latest",
            "async": true
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npx -y @latitude-data/claude-code-telemetry@latest",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

Both entries run the same command. `Stop` reports each turn as it completes and is `async` so it never blocks you. `SessionEnd` is not `async`: it is the one that fires for non-interactive runs (`claude -p`), and it also catches the last turn when you quit. They never double-report.

Restart Claude Code after saving.

## Captured data and privacy

Treat this as full-fidelity telemetry. Latitude receives the content needed to reconstruct Claude Code turns, including prompts, responses, tool input/output, and system context when available.

- Telemetry runs for each turn until disabled or uninstalled.
- Disable telemetry before working with sensitive material you do not want sent to Latitude.

## Custom redaction

If you want to keep telemetry enabled but mask specific span attributes before they leave your machine, set `LATITUDE_REDACT_ATTRIBUTES` in your Claude Code environment. Redaction happens locally, after the content gate and before the OTLP export.

`LATITUDE_REDACT_ATTRIBUTES` accepts a JSON array (or comma-separated list) of patterns. Each pattern can be:

- An **exact attribute name** — `"gen_ai.tool.call.arguments"`
- A **regex source string** — `"^gen_ai\\.(input|output)\\.messages$"` (anchored match)
- A **`/pattern/flags` string** — `"/^gen_ai\\.tool\\.call\\.(arguments|result)$/i"`

`LATITUDE_REDACT_MASK` sets the replacement value (default: `******`). Set it to `[]` to replace message arrays with an empty array instead of a string.

### Examples

Redact all prompt and response messages, plus tool arguments and results:

```bash
LATITUDE_REDACT_ATTRIBUTES='["/^gen_ai\\.(input|output)\\.messages$/", "/^gen_ai\\.tool\\.call\\.(arguments|result)$/"]' \
LATITUDE_REDACT_MASK='[]' \
claude
```

Redact only a specific custom attribute by exact name:

```bash
LATITUDE_REDACT_ATTRIBUTES='["user_prompt"]' \
claude
```

To persist redaction settings, add them to the `env` block in `~/.claude/settings.json`:

```json
{
  "env": {
    "LATITUDE_API_KEY": "lat_xxx",
    "LATITUDE_PROJECT": "your-project-slug",
    "LATITUDE_REDACT_ATTRIBUTES": "[\"/^gen_ai\\\\.(input|output)\\\\.messages$/\"]",
    "LATITUDE_REDACT_MASK": "[]"
  }
}
```

## Troubleshooting

**No traces appear.** Fully quit and relaunch Claude Code, then run a new prompt. Confirm the API key and project slug are correct.

**Need more diagnostics.** Set `LATITUDE_DEBUG=1` before running Claude Code. The telemetry command prints diagnostic output when uploads fail.

**Wrong project receives traces.** Re-run the installer with the correct project slug, or uninstall and install again.
