# Latitude pi telemetry

Pi coding agent extension that streams prompts, model turns, tool calls, and tool results to Latitude as OTLP traces.

## Install

```bash
npx -y @latitude-data/pi-telemetry install
```

Non-interactive:

```bash
npx -y @latitude-data/pi-telemetry install \
  --api-key=lat_xxx \
  --project=your-project-slug \
  --yes
```

The installer writes:

- `~/.pi/agent/settings.json` with the pi package entry `npm:@latitude-data/pi-telemetry@<version>`
- `~/.pi/agent/latitude-telemetry.json` with Latitude configuration

Restart pi after installation so it can install and load the package.

## Privacy

By default this captures full prompts, assistant responses, tool inputs, and tool outputs. Install with `--no-content` to keep structure, timing, token usage, model names, and tool names while scrubbing content fields.

For field-level PII controls while keeping content capture enabled, add `redact` to `~/.pi/agent/latitude-telemetry.json` or set `LATITUDE_REDACT_ATTRIBUTES`. Patterns are exact strings, regex source strings, or `/pattern/flags` strings.

```json
{
  "redact": {
    "attributes": ["/^gen_ai\\.(input|output)\\.messages$/", "gen_ai.tool.call.arguments"],
    "mask": "[]"
  }
}
```

Environment equivalent:

```bash
LATITUDE_REDACT_ATTRIBUTES='["/^gen_ai\\.(input|output)\\.messages$/"]' \
LATITUDE_REDACT_MASK='[]' \
pi
```

## Disable

```bash
LATITUDE_PI_TELEMETRY_ENABLED=0 pi
```

## Uninstall

```bash
npx -y @latitude-data/pi-telemetry uninstall
```
