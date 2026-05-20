# OpenClaw telemetry

Stream OpenClaw agent runs into Latitude as traces. After setup, agent runs appear in your project's **Traces** view with model calls, tool calls, token usage, timing, agent names, and nested subagent activity.

## Prerequisites

- A [Latitude account](https://console.latitude.so/login) with a project
- OpenClaw installed locally
- Node.js available on your `PATH`

## Install

1. In Latitude, copy your project slug from the project sidebar.
2. Create or copy an API key from **Settings → API Keys**.
3. Run the installer:

```bash
npx -y @latitude-data/openclaw-telemetry-cli install
```

The installer prompts for your API key and project slug, installs the OpenClaw telemetry plugin, enables it, and validates the configuration.

You can also pass values directly:

```bash
npx -y @latitude-data/openclaw-telemetry-cli install \
  --api-key=lat_xxx \
  --project=your-project-slug \
  --yes
```

## Restart and verify

Restart the OpenClaw gateway if the installer did not do it for you:

```bash
openclaw gateway restart
```

Send a message to an agent, then open your Latitude project and go to **Traces**. The new trace should appear within a few seconds.

## Structural-only telemetry

If you want trace structure without prompt, response, or tool content, install with:

```bash
npx -y @latitude-data/openclaw-telemetry-cli install --no-content
```

Structural-only traces still include timing, model, token usage, agent names, and run structure. Message content and tool input/output are omitted.

## Disable or uninstall

To pause telemetry, set the environment variable on the gateway process:

```bash
export LATITUDE_OPENCLAW_ENABLED=0
```

Restart the gateway for the change to take effect.

To remove the integration:

```bash
npx -y @latitude-data/openclaw-telemetry-cli uninstall
openclaw gateway restart
```

## Manual configuration

If you manage OpenClaw configuration yourself, install the plugin and add it to `~/.openclaw/openclaw.json`:

```bash
openclaw plugins install @latitude-data/openclaw-telemetry
```

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

Set `config.allowConversationAccess` to `false` for structural-only telemetry while keeping `hooks.allowConversationAccess` set to `true`.

## Captured data and privacy

By default, Latitude receives the content needed to reconstruct OpenClaw runs, including prompts, responses, system instructions, tool input/output, model metadata, and token usage.

- Use `--no-content` when you only want structural telemetry.
- Telemetry runs for each agent run until disabled or uninstalled.
- Latitude does not redact secrets from captured content.
- Disable telemetry before working with sensitive material you do not want sent to Latitude.

## Troubleshooting

**No traces appear.** Restart the gateway, confirm the API key and project slug are correct, and send a new agent message.

**Need more diagnostics.** Set `LATITUDE_DEBUG=1` on the gateway process and trigger another run.

**Traces show timing but no content.** Structural-only mode is enabled. Reinstall without `--no-content` or set `config.allowConversationAccess` to `true`.
