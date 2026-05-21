# Pi coding agent telemetry

Stream [pi coding agent](https://pi.dev) sessions into Latitude as traces with the first-party `@latitude-data/pi-telemetry` extension.

After setup, pi prompts appear in your Latitude project's **Traces** view with model calls, prompts, responses, token usage, tool calls, and tool results.

## Prerequisites

- A [Latitude account](https://console.latitude.so/login) with a project
- A Latitude API key from **Settings → API Keys**
- Your Latitude project slug from the project sidebar
- `pi` installed locally
- Node.js available on your `PATH`

## Install

Run the installer:

```bash
npx -y @latitude-data/pi-telemetry install
```

The installer prompts for your API key and project slug, adds the pi extension package to `~/.pi/agent/settings.json`, and writes Latitude config to `~/.pi/agent/latitude-telemetry.json`.

You can also pass values directly:

```bash
npx -y @latitude-data/pi-telemetry install \
  --api-key=lat_xxx \
  --project=your-project-slug \
  --yes
```

## Restart and verify

Restart pi so it can install and load the package. Send a prompt that uses the model or a tool, then open your Latitude project and go to **Traces**. The new trace should appear within a few seconds.

A trace includes:

- an `interaction` root span for the pi prompt
- `llm_request` spans for model calls
- `tool_call:<name>` spans for tool executions
- `gen_ai.input.messages` and `gen_ai.output.messages` for prompt/response reconstruction
- `gen_ai.tool.call.arguments` and `gen_ai.tool.call.result` for tool I/O

## Structural-only telemetry

By default, Latitude receives the content needed to reconstruct pi runs, including prompts, assistant responses, system instructions when available, tool arguments, and tool results.

If you want trace structure without conversation or tool content, install with:

```bash
npx -y @latitude-data/pi-telemetry install --no-content
```

Structural-only traces still include timing, token usage, provider/model names, tool names, session metadata, user/host identity, and whether content capture was enabled.

## Disable or uninstall

Disable the extension for one pi process:

```bash
LATITUDE_PI_TELEMETRY_ENABLED=0 pi
```

Remove the extension and config:

```bash
npx -y @latitude-data/pi-telemetry uninstall
```

Restart pi after uninstalling to unload the extension.

## Advanced configuration

The installer stores config in `~/.pi/agent/latitude-telemetry.json`. Environment variables override file values:

| Variable | Description |
| --- | --- |
| `LATITUDE_API_KEY` | API key used to upload traces |
| `LATITUDE_PROJECT` or `LATITUDE_PROJECT_SLUG` | Project slug for `X-Latitude-Project` |
| `LATITUDE_BASE_URL` | Ingest base URL, default `https://ingest.latitude.so` |
| `LATITUDE_DEBUG=1` | Print upload diagnostics |
| `LATITUDE_PI_NO_CONTENT=1` | Disable prompt/response/tool content capture |
| `LATITUDE_PI_USER_ID` | Override `user.id` |
| `LATITUDE_PI_USER_EMAIL` | Override user email |
| `LATITUDE_PI_USER_NAME` | Override user display name |

Use `--staging`, `--dev`, or `--base-url=<url>` during install to target a non-production Latitude ingest endpoint.

## Captured data and privacy

Full-content mode sends prompts, responses, system instructions when available, tool inputs, and tool outputs. Latitude does not redact secrets from captured content.

Disable telemetry or use `--no-content` before working with sensitive material you do not want sent to Latitude. Even `--no-content` mode still sends structural metadata such as cwd/session identifiers, model names, tool names, timing, token usage, and user/host identity.

## Troubleshooting

**No traces appear.** Restart pi or run `/reload`, then send a new prompt. Confirm the API key and project slug are correct.

**HTTP 401.** The API key is missing or invalid. Re-run the installer with a valid key.

**HTTP 400 about `X-Latitude-Project`.** The project slug is missing. Re-run the installer with `--project=your-project-slug`.

**Traces show timing but no prompt/response content.** Structural-only mode is enabled. Reinstall without `--no-content`, or set `LATITUDE_PI_NO_CONTENT=0` and reload pi.

**Need diagnostics.** Run `LATITUDE_DEBUG=1 pi` and trigger another prompt.
