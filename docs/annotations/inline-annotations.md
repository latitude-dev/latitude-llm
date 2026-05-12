---
title: Inline Annotations
description: Annotate any trace directly from its detail view
---

# Inline Annotations

Inline annotations are the primary way to leave human feedback on a trace. Any trace you can open — from the Traces page, from a search result, from an issue's logs, from a session view — has an annotation panel you can use.

## How Inline Annotations Work

When viewing any trace in Latitude:

1. Open the trace detail view by clicking on a trace.
2. Look for the annotation panel on the right side of the screen.
3. Create an annotation:
   - **Conversation-level**: Click the annotation button to assess the overall interaction.
   - **Message-level**: Click on a specific message to annotate just that part of the conversation.
   - **Text-range**: Select a substring within a message to anchor the annotation to that exact span.
4. Provide your verdict (thumbs up / thumbs down) and feedback.
5. Optionally link the annotation to an issue.

Annotations save as drafts immediately so a page refresh won't lose your work. They finalize automatically after 5 minutes of inactivity. Once finalized, they feed into analytics, issue discovery, and evaluation alignment alongside annotations created by [flaggers](./flaggers) and the [API](../scores/api).

## A Typical Review Workflow

The most efficient way to work through a batch of traces is to start from a [search](../search/overview) or a [saved search](../search/saved-searches):

1. Run a search (or open a saved one) that matches the cohort you want to review — for example, _"failed payments last week"_ or _"checkout flows over 5 steps"_.
2. Open the first matching trace.
3. Read the conversation, annotate, and move to the next trace.
4. Repeat until the cohort is covered. The saved search's **Annotated / Total** columns let your team see progress.

For shared review work, assign the saved search to a teammate. Assignment is a lightweight ownership signal; everyone can still see and open the search.

## When to Use Inline Annotations

Inline annotations cover the full range of review work:

- **Systematic review of a cohort**: Use a saved search to scope, then annotate each match.
- **Ad-hoc spot checks**: You're browsing traces and notice something worth flagging.
- **Issue investigation**: You're drilling into a specific issue and want to annotate the linked traces.
- **Demo and training**: Showing a new team member how annotation works.
- **Supplementary feedback**: Adding context to a trace that already has scores or flagger annotations.

If you want detection without human review for a fixed set of known failure categories, look at [flaggers](./flaggers) instead.

## Inline Annotations and Issues

When creating an inline annotation, you can:

- **Leave issue assignment automatic**: Let Latitude's discovery pipeline decide which issue the annotation belongs to (or create a new one) when the score is finalized.
- **Link to an existing issue**: Associate your annotation with a known failure pattern, bypassing automatic discovery for that score.

Once finalized, failed annotations feed into the issue discovery pipeline automatically. You don't need to create issues manually.

## Persisted Highlights

Annotations with a message or text-range anchor leave a highlight in the conversation view. Clicking a highlight focuses the matching annotation card in the panel, so you can jump between the conversation and the feedback that pinned it.

## Next Steps

- [Annotations Overview](./overview): How the annotation system works
- [Flaggers](./flaggers): Automatic annotators for common failure categories
- [Search](../search/overview): Find the traces you want to annotate
- [Issues](../issues/overview): How annotations connect to issue tracking
