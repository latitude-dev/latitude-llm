---
title: Signal management
description: Triage signals, monitor them with evaluations, resolve what you fix, ignore noise, and keep your signal list focused.
---

# Signal management

Once a signal exists, whether Latitude [discovered](./overview) it or you [created](./create) it, you work with it from its detail page. This page covers its states and the actions you can take.

## Signal states

A signal carries one or more states:

- New: discovered or created in the last 7 days.
- Escalating: occurrences are rising faster than the normal pattern for this time of week. Escalation is detected automatically and opens an incident.
- Ongoing: the steady state, once no other state applies.
- Resolved: you marked the problem as fixed. The signal is archived but keeps watching for recurrences.
- Regressed: a resolved signal started occurring again and was reopened.
- Ignored: you marked the signal as noise. It is archived, monitoring stops, and notifications are muted.

A signal can carry several states at once, for example New and Escalating. Separately, a signal with an active evaluation shows an Evaluated marker.

The Signals page has two tabs, Active and Archived. Resolved and ignored signals live in Archived; everything else is Active.

## Triage

When a signal appears:

1. Read its description to understand the pattern.
2. Open example sessions to see where it happened.
3. Judge how much it matters: a safety risk, a quality problem, or a rare edge case.
4. Act on it: assign an owner, set a priority, start monitoring, resolve it once fixed, ignore it as noise, or delete it.

Assign a signal to an org member and set its priority (Urgent, High, Medium, Low, or none) so the right person picks up the right thing first. You can filter the list by assignee.

## Monitor a signal

Monitoring attaches an evaluation that scores new sessions for the same behavior. For a discovered signal, open it and choose Generate an evaluation: Latitude builds a detector from the signal's examples, annotations, and scores, then keeps it aligned to human judgment. A signal you created already has the detector you defined.

From the signal you can:

- Change the sampling rate to trade coverage for cost.
- Realign a generated evaluation after adding annotations.
- Remove the evaluation to stop scoring new sessions.

Unresolve or unignore a signal before you generate an evaluation for it — archived signals can't start monitoring.

See [Evaluations](../evaluations/overview) for how detectors work, and [Create a signal](./create) to define one yourself.

## Investigate

For a signal worth digging into, review several example sessions and ask:

- What user inputs lead to it?
- Is the agent consistently wrong, or is the failure intermittent?
- Are there shared patterns in context, tools, retrieval, model, or prompt behavior?
- If an evaluation is attached, is it too strict, too lenient, or drifting from human review?

## Resolve and ignore

Resolve a signal once you've fixed the underlying problem. Resolving moves it to the Archived tab and, by default, keeps its evaluations running so Latitude notices if the problem comes back. Turn off "Keep evaluating" in the resolve dialog if you also want monitoring to stop; the default for that switch is a project setting.

Ignore a signal that isn't worth acting on. Ignoring moves it to Archived, archives its evaluations so monitoring stops, and mutes its notifications. Occurrences that Latitude discovers from annotations still attach to the ignored signal, so the noise keeps flowing into one place instead of spawning new signals.

Both actions are reversible: unresolve reopens a signal without marking it as regressed, and unignore returns it to the active list with notifications re-enabled.

## Mute notifications

Muting is a pure notification switch, separate from resolving and ignoring. A muted signal keeps collecting occurrences and still opens incidents when it escalates — you just don't get notified. Use mute when you want to keep watching a signal in the list without the pings. Ignoring a signal mutes it automatically; resolving or unignoring one re-enables its notifications.

## Delete a signal you created

A signal you created can be renamed or deleted from its detail page. Deleting also archives its evaluation and can't be undone. Existing scores stay in analytics. Discovered signals can't be deleted; ignore them instead.

## Catching regressions

After you ship a fix, resolve the signal and leave "Keep evaluating" on. Latitude keeps scoring new sessions; the first occurrence after the resolve reopens the signal, marks it as Regressed, and notifies you (the assignee when one is set, otherwise the project's members). You don't have to watch for it by hand. If [agent dispatch](/agent-dispatch/overview) is enabled with the "Regressed signal" trigger, Latitude also wakes your coding agent to investigate the regression.

## Keep signals manageable

As your project matures:

- Assign and prioritize signals so the important ones stand out.
- Monitor the signals you need ongoing coverage for.
- Resolve fixed problems and ignore noise so real problems stay visible.
- Keep descriptions clear enough for the next teammate to understand.

## Next steps

- [Signals overview](./overview): how discovery finds signals
- [Create a signal](./create): define one yourself
- [Monitors](../monitors/overview): watch saved searches, tools, users, and sessions
- [Evaluations](../evaluations/overview): monitor a signal on live traffic
