<p align="center">
  <img src="docs/assets/readme/readme-banner.png?raw=true" alt="Latitude — issue detection for AI agents" width="100%" />
</p>

<p align="center">
  <sub><b>New:</b> <a href="https://docs.latitude.so/getting-started/mcp">Latitude MCP server: connect your AI agent to Latitude →</a></sub>
</p>

<h1 align="center" style="border: none; margin-bottom: 8px;">
  Open source AI Agent Monitoring
</h1>

<p align="center">
  Sentry, but for agents and LLMs.
</p>

<p align="center">
  <a href="https://github.com/latitude-dev/latitude-llm/blob/main/LICENSE"><img src="https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/latitude-dev/latitude-llm/development/.github/badges/license.json" alt="License"></a>
  <a href="https://github.com/latitude-dev/latitude-llm/actions/workflows/deploy.yml"><img src="https://img.shields.io/github/actions/workflow/status/latitude-dev/latitude-llm/deploy.yml?branch=development&label=build" alt="Build"></a>
  <a href="https://github.com/latitude-dev/latitude-llm/graphs/commit-activity" target="_blank"><img alt="Commits last month" src="https://img.shields.io/github/commit-activity/m/latitude-dev/latitude-llm?labelColor=%20%2332b583&color=%20%2312b76a"></a>
  <a href="https://www.npmjs.com/org/latitude-data"><img src="https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/latitude-dev/latitude-llm/development/.github/badges/npm-downloads.json&logo=npm&logoColor=white" alt="npm downloads"></a>
  <a href="https://pypi.org/project/latitude-telemetry/"><img src="https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/latitude-dev/latitude-llm/development/.github/badges/pypi-downloads.json&logo=python&logoColor=white" alt="PyPI downloads"></a>
  <a href="https://github.com/latitude-dev/latitude-llm"><img src="https://img.shields.io/github/stars/latitude-dev/latitude-llm?style=social" alt="GitHub stars"></a>
  <a href="https://twitter.com/intent/follow?screen_name=trylatitude" target="_blank"><img src="https://img.shields.io/twitter/follow/trylatitude?logo=X&color=%20%23f5f5f5" alt="Follow on X"></a>
</p>

<p align="center">
  <a href="https://latitude.so/?utm_source=github_readme" rel="dofollow">Website</a>&nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="https://docs.latitude.so" rel="dofollow">Docs</a>&nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="https://latitude.so/changelog" rel="dofollow">Changelog</a>&nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="https://join.slack.com/t/trylatitude/shared_invite/zt-35wu2h9es-N419qlptPMhyOeIpj3vjzw">Slack</a>&nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="https://x.com/trylatitude">X</a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/gif-ui-dark.gif?raw=true">
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/readme/gif-ui-light.gif?raw=true">
    <img src="docs/assets/readme/gif-ui-light.gif?raw=true" alt="Demo of the Latitude UI showing LLM observability, issue tracking, and evals" width="800"/>
  </picture>
</p>

## 🌈 Why Latitude?

Latitude shows you **what will break next** in your AI Agent and helps you fix it before users notice.

- **[Issue-centric](https://docs.latitude.so/issues/overview#issues)**: failed traces grouped into tracked issues, with status, size, and trend.
- **[Human-aligned evals](https://docs.latitude.so/evaluations/alignment#evaluation-alignment)**: evals built automatically from your team's judgments, with an alignment score that tracks drift from human judgment over time.
- **[Agent-native traces](https://docs.latitude.so/observability/overview#observability-overview)**: multi-turn sessions, tool calls, and full execution paths in one view.
- **[Semantic search](https://docs.latitude.so/search/overview#search)**: find any trace by meaning, exact matches, or roughly similar sentences. No sampling, 100% of traces are searchable.
- **[Issue alerts](https://latitude.so/changelog)**: get notified the moment a new issue is detected or an existing one escalates. Connect Slack, email, or webhooks.
- **[MCP server](https://docs.latitude.so/getting-started/mcp)**: everything you can do in the Latitude UI, now available from your coding agent via MCP.

## 📚 Table of contents

- [Quick start](#-quick-start)
- [Integrations](#-integrations)
- [With Claude Code](#-with-claude-code)
- [Community](#-community)
- [Contributing](#-contributing)
- [License](#-license)
- [Links](#-links)

## ⚡ Quick start

You can use Latitude for free, including 20K credits/month, 30-day data retention, and unlimited seats.

Sign up at [latitude.so](https://latitude.so) and grab your API key and project slug.

### Recommended: ask your coding agent

Paste this prompt into Claude Code, Cursor, Windsurf, Codex, OpenCode, or another coding agent:

```text
Read the Latitude Telemetry AI skill from https://raw.githubusercontent.com/latitude-dev/skills/refs/heads/main/skills/latitude-telemetry/SKILL.md and add tracing to this application.
```

### Manual TypeScript setup

```bash
npm install @latitude-data/telemetry
```

This example uses OpenAI; replace it with the LLM SDK your app already imports.

```ts
import { Latitude } from "@latitude-data/telemetry";
import OpenAI from "openai";

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: { openai: OpenAI },
});

const client = new OpenAI();

await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
});

await latitude.shutdown();
```

Every supported LLM call now shows up as a trace in Latitude. Use `capture()` at request, conversation, or agent boundaries when you want to add user IDs, session IDs, tags, or metadata.

Python and any OpenTelemetry-compatible runtime are also supported. Full setup, provider guides, and OTel passthrough are in the [Start tracing guide](https://docs.latitude.so/telemetry/start-tracing).

## 🔌 Integrations

Latitude is provider-agnostic. Telemetry works out of the box with most model providers and frameworks ([OpenAI](https://docs.latitude.so/telemetry/providers/openai), [Anthropic](https://docs.latitude.so/telemetry/providers/anthropic), [Bedrock](https://docs.latitude.so/telemetry/providers/amazon-bedrock), [Vercel AI SDK](https://docs.latitude.so/telemetry/frameworks/vercel-ai-sdk), [LangChain](https://docs.latitude.so/telemetry/frameworks/langchain), and more), plus any OTLP-compatible backend.

See the [full integration list](https://docs.latitude.so/telemetry/start-tracing) for setup instructions.

## ✳️ With Claude Code

Building inside Claude Code? We have a dedicated package that captures full session transcripts as traces.
[Check out docs.](https://docs.latitude.so/telemetry/claude-code)

```bash
npx -y @latitude-data/claude-code-telemetry install
```

Works in the terminal, the Desktop app, and IDE extensions.

## 👥 Community

Join the [Slack community](https://join.slack.com/t/trylatitude/shared_invite/zt-35wu2h9es-N419qlptPMhyOeIpj3vjzw) to ask questions, share feedback, and show what you're building.

## 📄 License

Latitude is licensed under the [MIT License](LICENSE).

## 🤝 Contributing

Contributions are welcome. Read the [Contributing Guide](CONTRIBUTING.md) to get started, then join the [Slack community](https://join.slack.com/t/trylatitude/shared_invite/zt-35wu2h9es-N419qlptPMhyOeIpj3vjzw), open an [issue](https://github.com/latitude-dev/latitude-llm/issues/new), or submit a pull request.

**New to the project?** [Good first issues](https://github.com/latitude-dev/latitude-llm/contribute) are a friendly place to start.

## 🧑‍💻 Thanks to all of our contributors

<p align="center">
  <a href="https://github.com/geclos" title="geclos"><img src="https://avatars.githubusercontent.com/u/1948929?v=4&s=128" width="64" height="64" alt="geclos" /></a>
  <a href="https://github.com/csansoon" title="csansoon"><img src="https://avatars.githubusercontent.com/u/57395395?v=4&s=128" width="64" height="64" alt="csansoon" /></a>
  <a href="https://github.com/andresgutgon" title="andresgutgon"><img src="https://avatars.githubusercontent.com/u/49499?v=4&s=128" width="64" height="64" alt="andresgutgon" /></a>
  <a href="https://github.com/neoxelox" title="neoxelox"><img src="https://avatars.githubusercontent.com/u/15955031?v=4&s=128" width="64" height="64" alt="neoxelox" /></a>
  <a href="https://github.com/learningbizz" title="learningbizz"><img src="https://avatars.githubusercontent.com/u/58665730?v=4&s=128" width="64" height="64" alt="learningbizz" /></a>
  <a href="https://github.com/cesr" title="cesr"><img src="https://avatars.githubusercontent.com/u/5465249?v=4&s=128" width="64" height="64" alt="cesr" /></a>
  <a href="https://github.com/guillemwilly" title="guillemwilly"><img src="https://avatars.githubusercontent.com/u/161842218?v=4&s=128" width="64" height="64" alt="guillemwilly" /></a>
  <a href="https://github.com/paulacavero" title="paulacavero"><img src="https://avatars.githubusercontent.com/u/147257979?v=4&s=128" width="64" height="64" alt="paulacavero" /></a>
  <a href="https://github.com/ntizish" title="ntizish"><img src="https://avatars.githubusercontent.com/u/66680150?v=4&s=128" width="64" height="64" alt="ntizish" /></a>
  <a href="https://github.com/Ashad-h" title="Ashad-h"><img src="https://avatars.githubusercontent.com/u/15173020?v=4&s=128" width="64" height="64" alt="Ashad-h" /></a>
  <a href="https://github.com/cballou" title="cballou"><img src="https://avatars.githubusercontent.com/u/166784?v=4&s=128" width="64" height="64" alt="cballou" /></a>
  <a href="https://github.com/samufyi" title="samufyi"><img src="https://avatars.githubusercontent.com/u/114986220?v=4&s=128" width="64" height="64" alt="samufyi" /></a>
  <a href="https://github.com/daavidrgz" title="daavidrgz"><img src="https://avatars.githubusercontent.com/u/72865058?v=4&s=128" width="64" height="64" alt="daavidrgz" /></a>
  <a href="https://github.com/Bald1nh0" title="Bald1nh0"><img src="https://avatars.githubusercontent.com/u/61911413?v=4&s=128" width="64" height="64" alt="Bald1nh0" /></a>
  <a href="https://github.com/txus" title="txus"><img src="https://avatars.githubusercontent.com/u/83234?v=4&s=128" width="64" height="64" alt="txus" /></a>
  <a href="https://github.com/felpasl" title="felpasl"><img src="https://avatars.githubusercontent.com/u/5658895?v=4&s=128" width="64" height="64" alt="felpasl" /></a>
  <a href="https://github.com/NewtTheWolf" title="NewtTheWolf"><img src="https://avatars.githubusercontent.com/u/59208097?v=4&s=128" width="64" height="64" alt="NewtTheWolf" /></a>
  <a href="https://github.com/baibhavKumar1" title="baibhavKumar1"><img src="https://avatars.githubusercontent.com/u/109906215?v=4&s=128" width="64" height="64" alt="baibhavKumar1" /></a>
  <a href="https://github.com/cursoragent" title="cursoragent"><img src="https://avatars.githubusercontent.com/u/199161495?v=4&s=128" width="64" height="64" alt="cursoragent" /></a>
  <a href="https://github.com/david8z" title="david8z"><img src="https://avatars.githubusercontent.com/u/31882023?v=4&s=128" width="64" height="64" alt="david8z" /></a>
  <a href="https://github.com/eltociear" title="eltociear"><img src="https://avatars.githubusercontent.com/u/22633385?v=4&s=128" width="64" height="64" alt="eltociear" /></a>
  <a href="https://github.com/marcos-muino-garcia" title="marcos-muino-garcia"><img src="https://avatars.githubusercontent.com/u/166235?v=4&s=128" width="64" height="64" alt="marcos-muino-garcia" /></a>
  <a href="https://github.com/PeterDaveHello" title="PeterDaveHello"><img src="https://avatars.githubusercontent.com/u/3691490?v=4&s=128" width="64" height="64" alt="PeterDaveHello" /></a>
  <a href="https://github.com/timneutkens" title="timneutkens"><img src="https://avatars.githubusercontent.com/u/6324199?v=4&s=128" width="64" height="64" alt="timneutkens" /></a>
  <a href="https://github.com/VaibhavWakde52" title="VaibhavWakde52"><img src="https://avatars.githubusercontent.com/u/149496880?v=4&s=128" width="64" height="64" alt="VaibhavWakde52" /></a>
  <a href="https://github.com/zhyd1997" title="zhyd1997"><img src="https://avatars.githubusercontent.com/u/31362988?v=4&s=128" width="64" height="64" alt="zhyd1997" /></a>
  <a href="https://github.com/buweiyuqi" title="buweiyuqi"><img src="https://avatars.githubusercontent.com/u/57198914?v=4&s=128" width="64" height="64" alt="buweiyuqi" /></a>
  <a href="https://github.com/monotykamary" title="monotykamary"><img src="https://avatars.githubusercontent.com/u/1130103?v=4&s=128" width="64" height="64" alt="monotykamary" /></a>
  <a href="https://github.com/wnor543" title="wnor543"><img src="https://avatars.githubusercontent.com/u/23494178?v=4&s=128" width="64" height="64" alt="wnor543" /></a>
</p>

## 🔗 Links

- [Home page](https://latitude.so/v2/?utm_source=github_readme)
- [Documentation](https://docs.latitude.so/)
- [Changelog](https://latitude.so/changelog)
- [Slack community](https://join.slack.com/t/trylatitude/shared_invite/zt-35wu2h9es-N419qlptPMhyOeIpj3vjzw)
- [X / Twitter](https://x.com/trylatitude)

Made with love by the Latitude Team