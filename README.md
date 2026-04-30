<h1 align="center" style="border: none; margin-bottom: 8px;">
  Issue detection for AI Agents
</h1>

<p align="center">
  Sentry, but for agents and LLMs.
</p>

<p align="center">
  <a href="https://latitude.so/v2/?utm_source=github_readme" rel="dofollow">Website</a>&nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="https://docs.latitude.so" rel="dofollow">Docs</a>&nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="https://join.slack.com/t/trylatitude/shared_invite/zt-35wu2h9es-N419qlptPMhyOeIpj3vjzw">Slack</a>&nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="https://x.com/trylatitude">X</a>
</p>

> [!WARNING]
> You are viewing the **Latitude v2 Alpha** branch (`main`). This branch is in **active development** and is **not ready for production use**. APIs, features, and data formats may change without notice.
>
> For production use, please use the stable release on the [`latitude-v1`](https://github.com/latitude-dev/latitude-llm/tree/latitude-v1) branch.

<p align="center">
  <img src="docs/assets/readme/gif-ui.gif?raw=true" alt="Demo of the Latitude UI showing LLM observability, issue tracking, and evals" width="800"/>
</p>

## 🌈 Why Latitude?

Latitude shows you **what will break next** in your AI Agent and helps you fix it before users notice.

- **[Issue-centric](https://docs.latitude.so/issues/overview#issues)**: failed traces grouped into tracked issues, with status, size, and trend.
- **[Human-aligned evals](https://docs.latitude.so/evaluations/alignment#evaluation-alignment)**: evals built automatically from your team's judgments, with an alignment score that tracks drift from human judgment over time.
- **[Agent-native traces](https://docs.latitude.so/observability/overview#observability-overview)**: multi-turn sessions, tool calls, and full execution paths in one view.
- **Semantic search** _(coming soon)_: find traces by meaning, even when the exact words don't match.
- **[Simulations](https://docs.latitude.so/simulations/overview#simulations-overview)** _(coming soon)_: replay agents against saved scenarios before shipping.


## 📚 Table of contents

- [Quick start](#-quick-start)
- [Integrations](#-integrations)
- [With Claude Code](#-with-claude-code)
- [Roadmap](#roadmap)
- [Community](#-community)
- [Contributing](#-contributing)
- [License](#-license)
- [Links](#-links)

## ⚡ Quick start

Sign up at [latitude.so](https://latitude.so) and grab your API key and project slug.

### Install

```bash
npm install @latitude-data/telemetry
```

### Instrument

```ts
import { initLatitude } from "@latitude-data/telemetry"

initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: ["openai"],
})
```

Every LLM call now shows up as a trace in Latitude.

Python, Go, and other languages are also supported. Full setup, OTel passthrough, and self-hosting in the [getting started guide](https://docs.latitude.so/telemetry/overview).


## 🔌 Integrations

Latitude is provider-agnostic. Telemetry works out of the box with most model providers and frameworks (OpenAI, Anthropic, Bedrock, Vercel AI SDK, LangChain, and more), plus any OTLP-compatible backend.

See the [full integration list](https://docs.latitude.so/telemetry/providers/openai) for setup instructions.

## ✳️ With Claude Code

Building inside Claude Code? We have a dedicated package that captures full session transcripts as traces.
[Check out docs.](https://docs.latitude.so/telemetry/claude-code)

```bash
npx -y @latitude-data/claude-code-telemetry install
```

Works in the terminal, the Desktop app, and IDE extensions.

## Roadmap

- [x] OTel ingest, traces, sessions
- [x] Issue discovery + clustering
- [x] Issue-to-eval generation with alignment optimization
- [x] Eval alignment tracking (MCC, coverage)
- [ ] Semantic search: find traces by meaning *(in progress)*
- [ ] Potential issues: track failure modes you already know about
- [ ] Stable v2 release

## 👥 Community

Join the [Slack community](https://join.slack.com/t/trylatitude/shared_invite/zt-3cl2m3xph-k5DBp3sJOtt_u6u3vxzZ0g) to ask questions, share feedback, and show what you're building.

## 🤝 Contributing

Contributions are welcome. If you want to help, join the [Slack community](https://join.slack.com/t/trylatitude/shared_invite/zt-35wu2h9es-N419qlptPMhyOeIpj3vjzw), open an [issue](https://github.com/latitude-dev/latitude-llm/issues/new), or submit a pull request.

## 📄 License

Latitude is licensed under the [LGPL-3.0](LICENSE).

We also offer a more permissive commercial license for those who need it. Contact [licensing@latitude.so](mailto:licensing@latitude.so) for details.

## 🔗 Links

- [Home page](https://latitude.so/v2/?utm_source=github_readme)
- [Documentation](https://docs.latitude.so/)
- [Slack community](https://join.slack.com/t/trylatitude/shared_invite/zt-35wu2h9es-N419qlptPMhyOeIpj3vjzw)
- [X / Twitter](https://x.com/trylatitude)

Made with love by the Latitude Team