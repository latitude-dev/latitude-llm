---
title: Signal management
description: Triage signals, monitor them with evaluations, mute noise, and keep your signal list focused.
---

# Signal management

Once a signal exists, whether Latitude [discovered](./overview) it or you [created](./create) it, you work with it from its detail page. This page covers its states and the actions you can take.

## Signal states

A signal's status is one of three states:

- New: discovered or created in the last 7 days.
- Escalating: occurrences are rising faster than the normal pattern for this time of week. Escalation is detected automatically and surfaced by the Signal escalating [monitor](../monitors/overview).
- Ongoing: the steady state, once a signal is neither new nor escalating.

A signal can be both New and Escalating at once. Separately, a signal with an active evaluation shows an Evaluated marker.

The Signals page has two tabs, Active and Archived. Muting a signal moves it to Archived.

## Triage

When a signal appears:

1. Read its description to understand the pattern.
2. Open example sessions to see where it happened.
3. Judge how much it matters: a safety risk, a quality problem, or a rare edge case.
4. Act on it: assign an owner, set a priority, start monitoring, mute it, or delete it.

Assign a signal to an org member and set its priority (Urgent, High, Medium, Low, or none) so the right person picks up the right thing first. You can filter the list by assignee.

## Monitor a signal

Monitoring attaches an evaluation that scores new sessions for the same behavior. For a discovered signal, open it and choose Generate an evaluation: Latitude builds a detector from the signal's examples, annotations, and scores, then keeps it aligned to human judgment. A signal you created already has the detector you defined.

From the signal you can:

- Change the sampling rate to trade coverage for cost.
- Realign a generated evaluation after adding annotations.
- Remove the evaluation to stop scoring new sessions.

Unmute a signal before you generate an evaluation for it.

See [Evaluations](../evaluations/overview) for how detectors work, and [Create a signal](./create) to define one yourself.

## Investigate

For a signal worth digging into, review several example sessions and ask:

- What user inputs lead to it?
- Is the agent consistently wrong, or is the failure intermittent?
- Are there shared patterns in context, tools, retrieval, model, or prompt behavior?
- If an evaluation is attached, is it too strict, too lenient, or drifting from human review?

## Mute noise

Mute a signal that isn't worth acting on. Muting stops its notifications and moves it to the Archived tab, though new occurrences still register. Unmute to bring it back to the active list. Use muting for noise, not for problems you have already fixed.

## Delete a signal you created

A signal you created can be renamed or deleted from its detail page. Deleting also archives its evaluation and can't be undone. Existing scores stay in analytics. Discovered signals can't be deleted; mute them instead.

## Catching regressions

After you ship a fix, keep an evaluation on the signal so Latitude keeps scoring new sessions. If the behavior comes back, the evaluation scores it again. The Signal regressed [monitor](../monitors/overview) notifies you when a signal that had settled down starts being detected again, so you don't have to watch for it by hand.

## Keep signals manageable

As your project matures:

- Assign and prioritize signals so the important ones stand out.
- Monitor the signals you need ongoing coverage for.
- Mute noise so real problems stay visible.
- Keep descriptions clear enough for the next teammate to understand.

## Next steps

- [Signals overview](./overview): how discovery finds signals
- [Create a signal](./create): define one yourself
- [Monitors](../monitors/overview): get notified when signals are discovered, escalate, or regress
- [Evaluations](../evaluations/overview): monitor a signal on live traffic
