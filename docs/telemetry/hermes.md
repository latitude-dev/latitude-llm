# Hermes telemetry

Stream [Hermes Agent](https://github.com/NousResearch/hermes-agent) (Nous Research's open-source agent harness) runs into Latitude as traces. After setup, each Hermes turn appears in your project's **Traces** view with user prompts, model turns, tool calls, tool results, token usage, timing, and the real system prompt that reached the model.

## Prerequisites

- A [Latitude account](https://console.latitude.so/login) with a project
- Hermes Agent installed locally
- `pip` (Hermes already runs on Python — the plugin uses only the standard library plus `certifi`, which Hermes already ships)

## Install

1. In Latitude, copy your project slug from the project sidebar.
2. Create or copy an API key from **Settings → API Keys**.
3. Install the plugin:

```bash
pip install latitude-telemetry-hermes
```

4. Enable it by adding `latitude` to the enabled-plugins list in `~/.hermes/config.yaml`:

```yaml
plugins:
  enabled:
    - latitude
```

Hermes discovers the plugin through the `hermes_agent.plugins` entry point — there are no files to copy.

<Note>
  **Enable via `config.yaml`, not `hermes plugins enable latitude`.** Hermes's runtime loads
  pip/entry-point plugins, but its `hermes plugins list`/`enable`/`disable` commands scan only
  bundled and `~/.hermes/plugins/` directory plugins — so they report a pip-installed plugin as
  **"not installed or bundled"** even though it loads fine ([hermes-agent#23802](https://github.com/NousResearch/hermes-agent/issues/23802)).
  The `config.yaml` entry above is the reliable way to turn it on.
</Note>

<Note>
  The plugin must be installed into the **same Python that runs Hermes**. The official installer
  puts Hermes in its own venv (`~/.hermes/hermes-agent/venv`) that ignores your shell's Python, so
  a plain `pip install` from another interpreter (system, pyenv, mise, …) won't be discovered.
  Install into Hermes's venv instead:

  ```bash
  ~/.hermes/bin/uv pip install --python ~/.hermes/hermes-agent/venv/bin/python latitude-telemetry-hermes
  ```
</Note>

5. Set your credentials in the environment, or add them to `~/.hermes/.env` (Hermes loads it at startup):

```bash
LATITUDE_API_KEY=lat_xxx
LATITUDE_PROJECT=your-project-slug
```

<Note>
  The plugin sends to Latitude Cloud (`https://ingest.latitude.so`) by default. If you
  run a **self-hosted or local** Latitude, also set `LATITUDE_BASE_URL` to your ingest
  **origin only** — for example `http://localhost:3002` on a local dev stack — with no
  `/v1/traces` suffix (the plugin appends it). The API key and project slug must belong
  to that same instance.
</Note>

## Verify

Run Hermes and send a message to your agent, then open your Latitude project and go to **Traces**. The new trace should appear within a few seconds.

If nothing arrives, set `LATITUDE_DEBUG=true` in `~/.hermes/.env` and run again to see the plugin's logging. (`hermes plugins list` does **not** show pip-installed plugins — see the install note — so it can't be used to confirm the plugin is loaded.)

## Structural-only telemetry

If you want trace structure without prompt, response, or tool content, set:

```bash
LATITUDE_NO_CONTENT=true
```

Structural-only traces still include timing, model, token usage, and run structure. Message content and tool input/output are omitted.

## Disable or uninstall

To pause telemetry without removing anything, set the environment variable in `~/.hermes/.env`:

```bash
LATITUDE_HERMES_TELEMETRY_ENABLED=0
```

To stop Hermes loading the plugin at all, remove `latitude` from `plugins.enabled` in `~/.hermes/config.yaml`. (`hermes plugins disable latitude` doesn't work for pip-installed plugins — see the install note.)

To remove the integration entirely, drop it from `plugins.enabled` and uninstall the package:

```bash
pip uninstall latitude-telemetry-hermes
```

(Your `~/.hermes/.env` credentials are left in place so a re-install is one step.)

## Configuration

All configuration is read from environment variables (set them in your shell or `~/.hermes/.env`):

| Env | Default | Description |
|-----|---------|-------------|
| `LATITUDE_API_KEY` | — | API key (required) |
| `LATITUDE_PROJECT` / `LATITUDE_PROJECT_SLUG` | — | Project slug (required) |
| `LATITUDE_BASE_URL` | `https://ingest.latitude.so` | Ingest origin (no path; the plugin appends `/v1/traces`). Set to your own ingest for self-hosted/local, e.g. `http://localhost:3002` |
| `LATITUDE_HERMES_TELEMETRY_ENABLED` / `LATITUDE_TELEMETRY_ENABLED` | `true` | Master switch |
| `LATITUDE_HERMES_NO_CONTENT` / `LATITUDE_NO_CONTENT` | `false` | Export structure/timing only |
| `LATITUDE_DEBUG` | `false` | Verbose logging |

Telemetry stays off until both `LATITUDE_API_KEY` and a project are set.

## How it works

Hermes loads pip-installed plugins via the `hermes_agent.plugins` entry point and calls the module's `register(ctx)`, which subscribes to its lifecycle hooks (`pre_api_request` / `post_api_request`, `pre_llm_call` / `post_llm_call`, `pre_tool_call` / `post_tool_call`). The plugin assembles each turn into one trace — an `interaction` root span with an `llm_request` child per model call and a `tool_execution` child per tool call — and ships it to Latitude over OTLP. It is fail-open: a telemetry error never affects your agent.

## Captured data and privacy

By default, Latitude receives the content needed to reconstruct Hermes runs, including prompts, responses, the system prompt, tool input/output, model metadata, and token usage.

- Set `LATITUDE_NO_CONTENT=true` when you only want structural telemetry.
- Telemetry runs for each turn until disabled or uninstalled.
- Disable telemetry before working with sensitive material you do not want sent to Latitude.

## Troubleshooting

**No traces appear.** Confirm the plugin is enabled (`hermes plugins list`), check that the API key and project slug in `~/.hermes/.env` are correct, and send a new message.

**Need more diagnostics.** Set `LATITUDE_DEBUG=true` in `~/.hermes/.env` and trigger another run.

**Traces show timing but no content.** Structural-only mode is enabled. Remove `LATITUDE_NO_CONTENT` from `~/.hermes/.env`.
