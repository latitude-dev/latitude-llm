---
title: Simulation Reports
description: Understand and act on simulation results
---

<Info>
  **Coming Soon** — Simulations are under active development and not yet available. The design below reflects what's planned.
</Info>

# Simulation Reports

After a simulation run, you get a report showing how your agent performed against each scenario and evaluation. Reports help you decide whether changes are safe to ship.

## Report Structure

A simulation report contains:

### Summary

The top-level overview:

- **Total scenarios** — How many test cases were run
- **Pass rate** — Percentage of scenarios where all evaluations passed
- **Failure count** — Number of scenario-evaluation combinations that failed
- **Duration** — Total time for the simulation run

### Per-Scenario Results

For each scenario:

- **Scenario name** — The test case identifier
- **Status** — Pass (all evaluations passed) or fail (at least one evaluation failed)
- **Evaluation results** — Each evaluation's score, pass/fail verdict, and feedback

### Per-Evaluation Summary

Across all scenarios:

- **Evaluation name** — Which evaluation was applied
- **Pass rate** — How many scenarios passed this evaluation
- **Common failure patterns** — Recurring themes in failure feedback

## Reading Reports

### In the Terminal

When running locally, the CLI prints a formatted report:

```
Simulation Report
═══════════════════════════════════════════

Scenarios: 15 total, 13 passed, 2 failed
Duration: 45s

✓ Basic greeting                     [3/3 evaluations passed]
✓ Product inquiry                    [3/3 evaluations passed]
✗ Jailbreak attempt                  [2/3 evaluations passed]
  ✗ Safety Check: 0.2 — Agent disclosed system prompt
✓ Multi-turn context                 [3/3 evaluations passed]
...
```

### In Latitude

When results are uploaded, you can view them in the Latitude UI with:

- Interactive drill-down into specific scenarios and evaluations
- Full trace views for each scenario execution
- Historical comparison across simulation runs
- Score trends over time

## Acting on Results

### All Passed

Your changes are safe to ship. The agent handles all test scenarios within quality standards.

### Failures Detected

For each failure:

1. **Read the feedback** — The evaluation's feedback text explains what went wrong
2. **Inspect the trace** — Look at the full conversation to understand the agent's behavior
3. **Decide on action**:
   - **Fix the agent** — If the failure represents a real quality problem
   - **Update the scenario** — If the scenario is outdated or unrealistic
   - **Adjust the evaluation** — If the evaluation is too strict for this case

### Regressions

Compare current results against previous runs to detect regressions:

- A scenario that previously passed now fails → Something changed for the worse
- A scenario that previously failed now passes → An improvement (verify it's intentional)

## CI Integration

In CI pipelines, the simulation report determines whether the build passes:

- **Exit code 0** — All evaluations passed across all scenarios
- **Non-zero exit code** — At least one evaluation failed

You can configure strictness:

- **Strict mode** — Any failure blocks the build
- **Threshold mode** — The build passes if the overall pass rate exceeds a configured threshold (e.g., 95%)

## Building a Test Suite

Start small and grow:

1. **Begin with critical scenarios** — The most important interactions your agent handles
2. **Add regression tests** — When you discover and fix issues, add scenarios that would have caught them
3. **Include edge cases** — Tricky inputs, adversarial prompts, and boundary conditions
4. **Monitor coverage** — Are your scenarios testing the failure modes your production evaluations catch?

Over time, your simulation suite becomes a comprehensive safety net that gives you confidence in every deployment.

## Next Steps

- [Running Simulations](./cli) — CLI setup and configuration
- [Simulations Overview](./overview) — Why simulations matter
- [Issues](../issues/overview) — Turning production failures into simulation scenarios
