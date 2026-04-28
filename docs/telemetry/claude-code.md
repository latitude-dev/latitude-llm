<h1 align="center" style="border: none; margin-bottom: 8px;">
  Issue detection for AI Agents
</h1>

<p align="center">
  Sentry, but for agents and LLMs.
</p>

<p align="center">
  <a href="https://latitude-monitoring.mintlify.app" rel="dofollow">Docs</a>&nbsp;&nbsp;·&nbsp;&nbsp;
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

- **[Issue-centric](https://latitude-monitoring.mintlify.app/issues/overview#issues)**: failed traces grouped into tracked issues, with status, size, and trend.
- **[Human-aligned evals](https://latitude-monitoring.mintlify.app/evaluations/alignment#evaluation-alignment)**: evals built automatically from your team's judgments, with an alignment score that tracks drift from human judgment over time.
- **[Agent-native traces](https://latitude-monitoring.mintlify.app/observability/overview#observability-overview)**: multi-turn sessions, tool calls, and full execution paths in one view.
- **Semantic search** _(coming soon)_: find traces by meaning, even when the exact words don't match.
- **[Simulations](https://latitude-monitoring.mintlify.app/simulations/overview#simulations-overview)** _(coming soon)_: replay agents against saved scenarios before shipping.


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

Python, Go, and other languages are also supported. Full setup, OTel passthrough, and self-hosting in the [getting started guide](https://latitude-monitoring.mintlify.app/telemetry/overview).


## 🔌 Integrations

Latitude is provider-agnostic. Telemetry works out of the box with most model providers and frameworks (OpenAI, Anthropic, Bedrock, Vercel AI SDK, LangChain, and more), plus any OTLP-compatible backend.

See the [full integration list](https://latitude-monitoring.mintlify.app/guides/getting-started/quick-start-dev) for setup instructions.

## ✳️ With Claude Code

Building inside Claude Code? We have a [dedicated package](https://www.npmjs.com/package/@latitude-data/claude-code-telemetry) that captures full session transcripts as traces.

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

Contributions are welcome. For an overview of the repo and its architecture, see the [contributor guide](https://latitude-monitoring.mintlify.app/guides/contribution/contributors).

If you want to help, join the [Slack community](https://join.slack.com/t/trylatitude/shared_invite/zt-35wu2h9es-N419qlptPMhyOeIpj3vjzw), open an [issue](https://github.com/latitude-dev/latitude-llm/issues/new), or submit a pull request.

## 📄 License

Latitude is licensed under the [LGPL-3.0](LICENSE).

We also offer a more permissive commercial license for those who need it. Contact [licensing@latitude.so](mailto:licensing@latitude.so) for details.

## 🔗 Links

- [Home page](https://latitude.so?utm_campaign=github-readme)
- [Documentation](https://latitude-monitoring.mintlify.app/)
- [Slack community](https://join.slack.com/t/trylatitude/shared_invite/zt-35wu2h9es-N419qlptPMhyOeIpj3vjzw)
- [X / Twitter](https://x.com/trylatitude)

Made with love by the Latitude Team