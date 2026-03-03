<div align="center">
  <a href="https://ai.latitude.so?utm_source=github" target="_blank">
    <img src="docs/assets/readme/Logo.png?raw=true" alt="Latitude — Open Source AI Engineering Platform" width="700"/>
  </a>
</div>

<br/>

<h1 align="center" style="border: none; margin-bottom: 8px;">
  Open-Source AI Engineering Platform
</h1>

<p align="center">
  Observability and evaluations first, then an eval-driven reliability loop to continuously improve prompts.
</p>

<p align="center">
  <a href="https://docs.latitude.so" rel="dofollow">Docs</a>&nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="https://join.slack.com/t/trylatitude/shared_invite/zt-35wu2h9es-N419qlptPMhyOeIpj3vjzw">Slack</a>&nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="https://x.com/trylatitude">X</a>
</p>

> [!NOTE]
> You are viewing the **Latitude v2 Alpha** branch (`main`). For the current stable release, use [`latitude-v1`](https://github.com/latitude-dev/latitude-llm/tree/latitude-v1).

<p align="center">
  <img src="docs/assets/readme/gif_ui.gif?raw=true" alt="Latitude demo — observability, evals, and prompt management" width="800"/>
</p>

## 🌈 Why Latitude?

Latitude is an open-source platform for building and operating LLM features in production.

Most teams adopt Latitude in stages: start by instrumenting your existing LLM calls to get observability and evaluation coverage, then move into a reliability loop that turns production failures into repeatable fixes.

**Start with observability + evaluations:**

- **Observability** → capture prompts, inputs/outputs, tool calls, and latency/token usage/cost from real traffic
- **Prompt playground** → reproduce runs, iterate with real inputs, version changes, and publish to the AI Gateway
- **Datasets** → curate real examples for batch testing and regression suites
- **Evaluations** → built-in evals, LLM-as-judge, and human-in-the-loop scoring
- **Experiments** → compare models/providers and prompt versions with measurable results

**Grow into the reliability loop:**

- **Annotations** → turn human judgment into a signal you can track and optimize
- **Issue discovery** → cluster failures into recurring issues and failure modes
- **Automatic evals** → convert issues into continuous tests that guard releases
- **Prompt optimizer (GEPA)** → search prompt variations against your eval suite and reduce recurring failures

Latitude Telemetry works with most model providers and frameworks out of the box, and can be extended for custom integrations. See the [full integration list](https://docs.latitude.so/guides/getting-started/quick-start-dev) (including OTLP ingest).

## 📚 Table Of Contents

- [Getting Started](https://docs.latitude.so/guides/getting-started/introduction)
- [Evaluations](https://docs.latitude.so/guides/evaluations/overview)
- [Datasets & Testing](https://docs.latitude.so/guides/datasets/overview)
- [Prompt Manager](https://docs.latitude.so/guides/prompt-manager/overview)
- [Custom AI Agents](https://docs.latitude.so/guides/prompt-manager/agents)
- [Integrations & Deployment](https://docs.latitude.so/guides/integration/publishing-deployment)
- [Self-Hosting](https://docs.latitude.so/guides/self-hosted/production-setup)
- [Advanced: PromptL](https://docs.latitude.so/promptl/getting-started/introduction)
- [Contributing](#-contributing)
- [License](#-license)

## ⚡ Quick start

Latitude is available as a managed cloud product or as a self-hosted deployment:

1. **Latitude Cloud**: fully managed.
2. **Latitude Self-Hosted**: run the open-source distribution on your own infrastructure.

Choose the option that best fits your needs and follow the corresponding instructions below.

### Latitude Cloud

To get started with Latitude, follow these steps:

1. **Sign up** → Create an account at [latitude.so](https://latitude.so) and create a project.
2. **Instrument** → Add the telemetry SDK (recommended) or export OTLP traces to compatible backend.
3. **Evaluate** → Create datasets and evals to measure quality and catch regressions.
4. **Manage + ship** → Version prompts/agents, publish changes, and deploy via the gateway.
5. **Optimize** → Use eval-driven optimization to reduce recurring failures.

For more details on each step, see our [documentation](https://docs.latitude.so) or join the [community](https://join.slack.com/t/trylatitude/shared_invite/zt-35wu2h9es-N419qlptPMhyOeIpj3vjzw).

### Latitude Self-Hosted

Follow the instructions in the [self-hosted guide](https://docs.latitude.so/guides/self-hosted/production-setup) to get started with Latitude Self-Hosted.

After setting up Latitude Self-Hosted, you can follow the same steps as in the Latitude Cloud guide to create, test, evaluate, and deploy your prompts.

## 👥 Community

The Latitude community is on
[Slack](https://join.slack.com/t/trylatitude/shared_invite/zt-3cl2m3xph-k5DBp3sJOtt_u6u3vxzZ0g), where you can ask questions, share feedback, and show what you're building.

## 🤝 Contributing

Contributions are welcome. For an overview of the repo and its architecture, see
[the contributor guide](https://docs.latitude.so/guides/contribution/contributors).

If you want to help, join the [Slack community](https://join.slack.com/t/trylatitude/shared_invite/zt-35wu2h9es-N419qlptPMhyOeIpj3vjzw), open an
[issue](https://github.com/latitude-dev/latitude-llm/issues/new), or submit a pull request.

## 📄 License

Latitude is licensed under the [LGPL-3.0](LICENSE).

Alternatively, we offer a more permissive commercial license for those who need it. Please contact us at [licensing@latitude.so](mailto:licensing@latitude.so) for more information.

## 🔗 Links

- [Home page](https://latitude.so?utm_campaign=github-readme)
- [Documentation](https://docs.latitude.so/)
- [Slack community](https://join.slack.com/t/trylatitude/shared_invite/zt-35wu2h9es-N419qlptPMhyOeIpj3vjzw)
- [X / Twitter](https://x.com/trylatitude)

Made with love by the Latitude Team
