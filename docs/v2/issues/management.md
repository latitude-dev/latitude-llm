---
title: Issue Management
description: Workflows for triaging, investigating, and resolving issues
---

# Issue Management

Once Latitude discovers issues, your team needs workflows to triage, investigate, and resolve them. This page covers practical approaches to issue management.

## Triage Workflow

When new issues appear, your team should:

1. **Review the issue description** — Understand what failure pattern was discovered
2. **Examine example traces** — Click into specific traces to see the actual conversations where the issue occurred
3. **Assess severity** — Is this a critical safety issue, a quality degradation, or a minor edge case?
4. **Decide on action**:
   - **Generate an evaluation** to start automated monitoring
   - **Create an annotation queue** to gather more human feedback
   - **Ignore** if the issue is irrelevant or too rare to track

## Investigating an Issue

For issues that need deeper investigation:

### Review Example Traces

Each issue links to the traces where it was detected. Read through several examples to understand:

- What kinds of user inputs trigger the issue?
- Is the agent consistently wrong, or is it intermittent?
- Are there common patterns in the conversation context?

### Check Related Evaluations

If the issue was discovered from a specific evaluation's failures, review that evaluation's configuration:

- Is the evaluation too strict? (Flagging acceptable behavior)
- Is it too lenient? (Missing obvious failures)
- Does the trigger configuration need adjustment?

### Gather Human Feedback

Create an annotation queue filtered to traces where the issue was detected. Have reviewers annotate these traces to:

- Confirm whether the automated detection is correct
- Provide richer feedback about what went wrong
- Build alignment data for the linked evaluation

## Resolving Issues

When your team has fixed the underlying problem:

1. Navigate to the issue detail page
2. Click **Resolve**
3. Optionally set a **monitoring window** (e.g., 7 days)

During the monitoring window, Latitude continues watching for the pattern. If it reappears, the issue automatically moves to **Regressed** state, alerting your team that the fix didn't hold.

## Working with Regressed Issues

A regressed issue means a previously resolved problem has returned. This is a high-priority signal:

- The fix may have been incomplete
- A new code change may have reintroduced the problem
- The agent's behavior may have drifted due to model updates

When an issue regresses:

1. Review the new occurrence traces — are they the same failure pattern or something subtly different?
2. Compare with the original resolution — what changed?
3. Fix and re-resolve with a monitoring window

## Organizing Issues

As your project matures, you'll accumulate many issues. Keep them manageable:

- **Resolve fixed issues** rather than leaving them open — the monitoring window catches regressions
- **Ignore irrelevant issues** — Don't let noise drown out real problems
- **Use issue descriptions** to communicate context — future team members will read them
- **Link related evaluations** — Every meaningful issue should have an evaluation monitoring for it

## Next Steps

- [Issues Overview](./overview) — How issues are discovered
- [Evaluations](../evaluations/overview) — Generating evaluations from issues
- [Annotation Queues](../annotations/annotation-queues) — Building review workflows for investigation
