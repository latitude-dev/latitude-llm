# OpenClaw telemetry

Stream OpenClaw agent runs into Latitude as traces. After setup, agent runs appear in your project's **Traces** view with model calls, tool calls, token usage, cost, timing, and nested subagent activity — as a proper `invoke_agent → chat → execute_tool` tree.

The recommended way is OpenClaw's **official OpenTelemetry exporter** (the bundled `@openclaw/diagnostics-otel` plugin), pointed at Latitude's OTLP ingest. It follows OpenTelemetry GenAI semantic conventions and is maintained by OpenClaw — see [OpenClaw's OpenTelemetry docs](https://docs.openclaw.ai/gateway/opentelemetry).

> **Deprecated:** the previous `@latitude-data/openclaw-telemetry` plugin (and its `…-cli` installer) is replaced by the native exporter below. See [Migrating from the Latitude plugin](#migrating-from-the-latitude-plugin).

## Prerequisites

- A [Latitude account](https://console.latitude.so/login) with a project
- OpenClaw 2026.6 or newer
- A Latitude **API key** and your **project slug** (project sidebar → **Settings → API Keys**)

## Setup

### 1. Install the exporter

```bash
openclaw plugins install clawhub:@openclaw/diagnostics-otel
```

### 2. Point it at Latitude

Add the `diagnostics.otel` block to `~/.openclaw/openclaw.json`. Latitude's ingest accepts OTLP/HTTP (protobuf) at `/v1/traces` and authenticates with your API key; the project is selected with the `X-Latitude-Project` header.

```jsonc
{
  "diagnostics": {
    "otel": {
      "enabled": true,
      "traces": true,
      "protocol": "http/protobuf",
      "tracesEndpoint": "https://ingest.latitude.so/v1/traces",
      "headers": {
        "Authorization": "Bearer lat_xxx",
        "X-Latitude-Project": "your-project-slug"
      },
      "captureContent": {
        "enabled": true,
        "inputMessages": true,
        "outputMessages": true,
        "toolInputs": true,
        "toolOutputs": true,
        "systemPrompt": true
      }
    }
  }
}
```

The same keys can be set non-interactively:

```bash
openclaw config set 'diagnostics.otel.enabled' true
openclaw config set 'diagnostics.otel.traces' true
openclaw config set 'diagnostics.otel.protocol' '"http/protobuf"'
openclaw config set 'diagnostics.otel.tracesEndpoint' '"https://ingest.latitude.so/v1/traces"'
openclaw config set 'diagnostics.otel.headers' \
  '{"Authorization":"Bearer lat_xxx","X-Latitude-Project":"your-project-slug"}'
openclaw config set 'diagnostics.otel.captureContent' \
  '{"enabled":true,"inputMessages":true,"outputMessages":true,"toolInputs":true,"toolOutputs":true,"systemPrompt":true}'
```

### 3. Restart and verify

```bash
openclaw gateway restart
```

Send a message to an agent, then open your Latitude project and go to **Traces** — the run should appear within a few seconds.

## Structural-only telemetry

To capture trace structure (timing, model, token usage, cost, run/tool shape) without prompt, response, or tool content, set `captureContent.enabled` to `false`:

```bash
openclaw config set 'diagnostics.otel.captureContent.enabled' false
openclaw gateway restart
```

## Captured data and privacy

With `captureContent.enabled = true`, Latitude receives the content needed to reconstruct runs — prompts, responses, system instructions, and tool input/output — plus model metadata, token usage, and cost. The granular `captureContent.*` flags let you capture some kinds of content and not others. Content is **not** exported unless you opt in. Disable capture (or telemetry entirely) before working with sensitive material you don't want sent to Latitude.

## Disable

Pause the exporter without uninstalling:

```bash
openclaw config set 'diagnostics.otel.enabled' false
openclaw gateway restart
```

## Migrating from the Latitude plugin

If you previously installed `@latitude-data/openclaw-telemetry`, remove it and switch to the native exporter above:

```bash
openclaw plugins uninstall @latitude-data/openclaw-telemetry --force
openclaw plugins install clawhub:@openclaw/diagnostics-otel
# add the diagnostics.otel config from step 2, then:
openclaw gateway restart
```

The native exporter produces the same Traces view (and a cleaner `invoke_agent → chat → execute_tool` structure), so no changes are needed on the Latitude side.

## Troubleshooting

**No traces appear.** Restart the gateway, confirm the API key and project slug are correct, and send a new agent message. A `401`/`403` from ingest means the API key isn't valid for that project's organization.

**Traces show timing but no content.** `captureContent.enabled` is `false` — set it to `true` and restart.
