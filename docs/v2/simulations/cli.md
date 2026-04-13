---
title: Running Simulations
description: Use the Latitude CLI to run simulations locally or in CI
---

# Running Simulations

Simulations run through the **Latitude CLI**, a command-line tool that executes your agent against test scenarios and evaluates the results. The CLI is designed for both local development and CI/CD pipelines.

## Installation

Install the Latitude CLI as a development dependency in your project:

```bash
npm install --save-dev @latitude-data/cli
```

Or run it directly with npx:

```bash
npx @latitude-data/cli simulate
```

## Configuration

Simulations are configured through a configuration file in your project. The configuration specifies:

- **Scenarios** — The test cases to run
- **Evaluations** — Which evaluation scripts to apply
- **Agent entry point** — How to invoke your agent
- **Upload settings** — Whether to send results to Latitude

## Running Locally

During development, run simulations locally to get quick feedback:

```bash
npx latitude simulate
```

The CLI will:

1. Load your scenarios from the configuration
2. Execute your agent against each scenario
3. Run evaluation scripts on the results
4. Print a summary report to the terminal

Local runs are fast and don't require network access to Latitude (unless uploading results).

## Running in CI

Add simulations to your CI/CD pipeline to gate deployments on quality:

```yaml
# Example: GitHub Actions
- name: Run Latitude Simulations
  run: npx latitude simulate --ci
  env:
    LATITUDE_API_KEY: ${{ secrets.LATITUDE_API_KEY }}
```

In CI mode, the CLI:

- Returns a non-zero exit code if any evaluation fails
- Outputs results in a CI-friendly format
- Optionally uploads traces and annotations to Latitude for historical tracking

## Uploading Results

When you provide a Latitude API key, simulation results can be uploaded to your project. This gives you:

- **Historical tracking** — See how simulation results change over time
- **Trace inspection** — View full simulation traces in the Latitude UI
- **Annotation integration** — Simulation annotations appear in your project's analytics
- **Regression detection** — Compare simulation results across commits

## Writing Scenarios

Scenarios define the inputs your agent will receive. A simple scenario might be:

```json
{
  "name": "Basic greeting",
  "messages": [
    { "role": "user", "content": "Hello, can you help me?" }
  ]
}
```

A multi-turn scenario:

```json
{
  "name": "Context retention across turns",
  "messages": [
    { "role": "user", "content": "My name is Alice" },
    { "role": "user", "content": "What's my name?" }
  ]
}
```

### Scenario Sources

Build your scenario library from:

- **Production traces** — Export real interactions that represent important use cases
- **Issue reproductions** — Create scenarios that trigger known failure patterns
- **Edge cases** — Hand-write scenarios for tricky inputs your agent should handle
- **Regression tests** — When you fix a bug, add a scenario that would have caught it

## Next Steps

- [Simulation Reports](./reporting) — Understanding simulation results
- [Simulations Overview](./overview) — Why simulations matter
- [Evaluations](../evaluations/overview) — The evaluation scripts simulations use
