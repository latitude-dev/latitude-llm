---
title: Issue Management
description: Workflows for triaging, investigating, and resolving issues
---

# Issue Management

After Latitude discovers an issue, use the issue detail view to decide whether to investigate, monitor, resolve, or ignore it.

## Triage Workflow

When a new issue appears:

1. **Review the description** to understand the discovered failure pattern.
2. **Open example traces** to see the conversations where it occurred.
3. **Assess severity**: safety risk, quality degradation, or minor edge case.
4. **Choose an action**:
   - Generate an evaluation for ongoing monitoring.
   - Resolve it if the problem is already fixed.
   - Ignore it if it is noise or too rare to track.

## Investigating an Issue

For issues that need deeper investigation, review several example traces and ask:

- What user inputs trigger the issue?
- Is the agent consistently wrong, or is the failure intermittent?
- Are there shared patterns in context, tools, retrieval, model, or prompt behavior?
- If evaluations are linked, are they too strict, too lenient, or drifting from human review?

## Resolving Issues

When the underlying problem is fixed:

1. Open the issue detail page.
2. Click **Resolve**.
3. Choose whether to keep monitoring.

The **keep monitoring** toggle controls linked evaluations:

- **Enabled**: Linked evaluations stay active and can move the issue to **Regressed** if the failure returns.
- **Disabled**: Linked evaluations are archived when the issue resolves.

The default comes from project settings, or from the organization setting if the project has no override. You can change it for each resolve action.

## Working with Regressed Issues

A regressed issue is a previously resolved problem that has returned. Treat it as high priority:

1. Review the new occurrence traces and confirm they match the original failure pattern.
2. Compare them with the original fix and resolution notes.
3. Fix the cause and resolve the issue again.

Regression can mean the first fix was incomplete, a later change reintroduced the problem, or the agent drifted after model or prompt updates.

## Ignoring Issues

Ignoring is different from resolving:

- Ignoring immediately archives all linked evaluations, regardless of the keep-monitoring setting.
- Ignored issues are hidden from default views but can be restored later.
- Use ignore for noise, not for problems that have been fixed.

## Keeping Issues Manageable

As your project matures:

- Resolve fixed issues instead of leaving them open.
- Keep monitoring enabled when regressions matter.
- Ignore irrelevant issues so real problems stay visible.
- Keep issue descriptions clear enough for future teammates.
- Link meaningful issues to evaluations when you need ongoing coverage.

## Next Steps

- [Issues Overview](./overview): How issues are discovered
- [Evaluations](../evaluations/overview): Generate monitors from issues
- [Annotations](../annotations/overview): Leave human feedback on issue traces
