---
name: agentation-watch-mode
description: Continuous Agentation annotation handling. Use when the user says "watch mode", asks you to watch for Agentation annotations, process feedback as it arrives, or keep fixing annotation-driven changes until told to stop or a timeout is reached.
---

# Agentation watch mode

**When to use:** The user says `watch mode`, wants continuous Agentation feedback handling, or asks you to keep watching annotations and applying fixes as new feedback arrives.

## Goal

Stay in a watch loop so the user can annotate in the browser and have those annotations processed continuously.

## Workflow

1. Start a watch loop with `agentation_agentation_watch_annotations`.
2. For each returned annotation:
   - Call `agentation_agentation_acknowledge` immediately so the user can see you picked it up.
   - Read any extra session context you need.
   - Make the requested fix.
   - Call `agentation_agentation_resolve` with a short summary of what changed.
3. After the batch is done, call `agentation_agentation_watch_annotations` again.
4. Continue until the user says stop or the watch call times out.

## Defaults

- If the user gives a session ID, watch that session.
- If they do not, watch all sessions.
- Use a short batching window so nearby annotations are grouped together.
- Use a reasonable timeout and report when it expires.

## Handling ambiguous feedback

- If an annotation is unclear, reply on the thread with a short clarifying question before making speculative changes.
- If you cannot complete the fix safely, leave the annotation open and explain the blocker in a reply.

## Response style

- Keep progress updates brief.
- In each resolve summary, state what you changed, not just that it is done.
