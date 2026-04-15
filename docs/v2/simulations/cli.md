---
title: Simulation CLI
description: Use the Latitude CLI to run simulations locally or in CI
---

<Info>
  **Coming Soon.** Simulations are under active development and not yet available. The design below reflects what's planned.
</Info>

# Simulation CLI

Simulations run through the **Latitude CLI**, a performant JavaScript/TypeScript tool that executes your agent against test scenarios and evaluates the results. The CLI is designed for both local development and CI/CD pipelines.

## How the CLI Works

The CLI is **language-agnostic** and **local-first**:

1. You write simulation entrypoints as `*.sim.*` files in your project
2. You configure the command that runs those entrypoints through your chosen runtime/toolchain
3. The CLI discovers `*.sim.*` files, invokes your configured command, and collects results
4. A local HTTP bridge connects the CLI to a lightweight SDK in your test code
5. Evaluation scripts run locally against the captured traces
6. Results can optionally be uploaded to Latitude

The CLI should be useful as a standalone simulation runner even without a Latitude account.

## The SDK Entrypoint

Each simulation file uses the SDK to define test scenarios:

```typescript
import { Simulation, Passed, Failed } from '@latitude-data/sdk'

Simulation({
  name: 'Customer support quality',
  threshold: 90,
  dataset: 'clxxxxxxxxxxxxxxxxxxxxxxxxx', // Latitude dataset CUID or custom loader
  agent: async (scenario) => {
    // Call your agent with the scenario inputs
    const response = await yourAgent(scenario.input)
    return response
  },
  evaluations: [
    'issues', // Run all issue-linked evaluations
    'clxxxxxxxxxxxxxxxxxxxxxxxxx', // Specific evaluation by ID
    async ({ output, scenario, conversation, metadata }) => {
      // Custom inline evaluation
      if (output.includes('I don\'t know')) {
        return Failed('Agent gave up instead of attempting the task')
      }
      return Passed('Agent provided a substantive response')
    }
  ]
})
```

Key details:

- `Passed(score?, feedback)` and `Failed(score?, feedback)` always require feedback. Score defaults to 1 (passed) or 0 (failed) when omitted.
- The `issues` selector downloads all issue-linked evaluation scripts and runs them locally.
- Custom evaluations receive `output`, `scenario`, `conversation`, and `metadata`.
- Custom evaluations can return one score or an array of scores.

## Dataset Sources

Scenarios can come from:

- **A Latitude dataset**: Referenced by CUID. The CLI downloads the dataset rows as scenarios.
- **A custom function**: A loader function that returns scenarios programmatically. Stored as `"CUSTOM"` in simulation metadata.

Query-backed datasets are planned for a future release.

## Running Locally

During development, run simulations locally to get quick feedback. The CLI prints a testing-style summary to the terminal.

Local runs are fast and don't require network access to Latitude unless you're downloading evaluations or uploading results.

## Running in CI

Add simulations to your CI/CD pipeline to gate deployments on quality. The CLI returns CI-friendly exit codes:

- **Exit code 0**: All evaluations passed (or pass rate exceeds the configured threshold)
- **Non-zero exit code**: At least one evaluation failed below the threshold

## Uploading Results

When you provide a Latitude API key, simulation results can be uploaded to your project:

- Score uploads use the same `POST /v1/organizations/:organizationId/projects/:projectId/scores` endpoint as other score sources
- Custom evaluation results use the default custom-score contract
- Latitude evaluation results include `_evaluation: true` with evaluation metadata and the evaluation CUID as `source_id`

This gives you historical tracking, trace inspection in the Latitude UI, and score integration with your project's analytics.

## Additional Language SDKs

The CLI is JavaScript/TypeScript-native, but lightweight SDKs for other languages (Python, Ruby, PHP, Go) can provide the simulation entrypoint and bridge needed to connect to the CLI. The CLI itself remains agnostic to the language your agent is written in.

## Next Steps

- [Simulation Reports](./reporting): Understanding simulation results
- [Simulations Overview](./overview): Why simulations matter
- [Evaluations](../evaluations/overview): The evaluation scripts simulations use
