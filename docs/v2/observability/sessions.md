---
title: Sessions
description: Understand multi-turn conversations and session-level aggregation
---

# Sessions

A session represents a multi-turn conversation between a user and your agent. While a trace captures a single interaction, a session groups related traces together to show the full conversation arc.

## How Sessions Work

Sessions are formed when your application provides a `session_id` with its telemetry. All traces sharing the same session ID are grouped together chronologically.

A session might look like:

1. **Trace 1**: User asks "What's the weather?" → Agent responds with current weather
2. **Trace 2**: User asks "What about tomorrow?" → Agent responds with the forecast
3. **Trace 3**: User asks "Should I bring an umbrella?" → Agent gives a recommendation

Each turn is its own trace with its own spans, scores, and evaluations. The session ties them together.

## Why Sessions Matter

Sessions enable:

- **Conversation-level evaluation** — Evaluations can target session-level interactions, not just individual turns. This catches problems like context loss, contradiction, and conversational drift.
- **Session-level score aggregation** — Roll up scores across an entire conversation to see overall quality, not just per-turn results.
- **Richer issue context** — When drilling into issues, seeing the full session context helps understand failure patterns that only emerge across multiple turns.
- **Simulation granularity** — Simulation reports can show results at the session level when your test scenarios involve multi-turn conversations.

## Viewing Sessions

The **Sessions** page shows a table of all sessions in your project. Each row provides:

- Session identifier
- Number of traces (turns) in the session
- Total duration across all traces
- Aggregated cost and token usage
- Latest activity timestamp

Click into a session to see all of its traces in chronological order, with the full conversation flow visible.

## Sessions and Annotation Queues

When you add a session to an annotation queue, Latitude resolves it to the session's newest trace. The queue item stores that trace, and the reviewer sees the full conversation context derived from all traces sharing the same session ID.

This means:

- Queue items always reference a specific trace
- Session context is derived at review time from related traces
- Reviewers see the conversation in full, not just one isolated turn

## Next Steps

- [Scores](../scores/overview) — How scores attach to traces and sessions
- [Evaluations](../evaluations/triggers) — Configuring evaluations to target sessions
- [Annotation Queues](../annotations/annotation-queues) — Adding sessions to review backlogs
