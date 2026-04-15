---
title: Simulations Overview
description: Test your agent against scenarios before shipping to production
---

<Info>
  **Coming Soon.** Simulations are under active development and not yet available. The design below reflects what's planned.
</Info>

# Simulations Overview

Simulations let you run your agent against test scenarios and evaluate the results before changes reach production. Think of them as CI/CD for agent quality: run your tests, check the report, and ship with confidence.

## What Is a Simulation

A simulation is a **local-first test run** of your agent that:

1. Executes your agent against a set of predefined **scenarios** (user inputs)
2. Captures the agent's responses as traces
3. Runs **evaluation scripts** against those traces
4. Produces a **report** with pass/fail results, scores, and feedback

Simulations are designed to be **local-first**: the Latitude CLI works as a standalone simulation runner, even without a hosted Latitude workspace. You can run simulations, execute evaluations, and get results entirely on your local machine or in CI. Uploading results to Latitude for historical tracking and team visibility is optional.

Simulations reuse the same evaluation scripts that monitor production traffic. This means the quality bar in testing matches the quality bar in production.

## Why Simulations Matter

Without simulations, the only way to know if a change breaks your agent is to deploy it and wait for evaluation failures to appear in production. Simulations close this gap:

- **Catch regressions before deployment**: Run simulations in CI to block merges that degrade quality
- **Validate fixes**: After resolving an issue, run simulations to confirm the fix works
- **Test new scenarios**: Add test cases for edge cases and failure modes you've discovered
- **Iterate faster**: Get feedback in minutes instead of waiting for production traffic

## How Simulations Work

1. You define **scenarios**: Each scenario is a set of inputs your agent should handle
2. You run the simulation using the **Latitude CLI**
3. The CLI executes your agent locally against each scenario
4. Each execution produces a **trace**
5. The CLI runs configured **evaluation scripts** against each trace
6. Results are compiled into a **report**
7. Optionally, traces and scores are uploaded to Latitude for historical tracking

## Scenarios

A scenario defines what to test. At minimum, it includes:

- **User messages**: The input(s) your agent receives
- **Context** (optional): Any additional context or metadata

Scenarios can be:

- **Written by hand**: For specific edge cases and regression tests
- **Derived from production traces**: Export real interactions as test cases
- **Generated from issues**: Create scenarios that reproduce known failure patterns

## Evaluation Reuse

The key insight behind simulations: **they reuse your production evaluation scripts**. The same script that monitors for jailbreak attempts in production also checks for jailbreak attempts in your simulation.

This ensures:

- Test quality standards match production quality standards
- New evaluations generated from production issues automatically become test checks
- There's no separate "test evaluation" system to maintain

## Next Steps

- [Running Simulations](./cli): How to run simulations with the Latitude CLI
- [Simulation Reports](./reporting): Understanding and acting on simulation results
- [Evaluations](../evaluations/overview): The evaluation scripts that power simulations
