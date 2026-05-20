---
title: Inline Annotations
description: Annotate any trace directly from its detail view
---

# Inline Annotations

Inline annotations are the main way to leave human feedback on a trace. Any trace you can open—from Traces, Search, Issues, or Sessions—has an annotation panel.

## How Inline Annotations Work

When viewing a trace:

1. Open the trace detail view.
2. Use the annotation panel on the right.
3. Choose a scope:
   - **Conversation-level**: assess the whole interaction.
   - **Message-level**: annotate one message.
   - **Text-range**: anchor feedback to selected text inside a message.
4. Add a thumbs-up or thumbs-down verdict and feedback.
5. Optionally link the annotation to an issue.

Annotations save as drafts while you edit. Once finalized, they feed analytics, issue discovery, and evaluation alignment alongside annotations from [flaggers](./flaggers) and the [API](../scores/api).

## A Typical Review Workflow

For batch review, start from [search](../search/overview) or a [saved search](../search/saved-searches):

1. Run or open a search for the cohort you want to review, such as _"failed payments last week"_ or _"checkout flows over 5 steps"_.
2. Open a matching trace.
3. Read the conversation, annotate it, and move to the next trace.
4. Use the saved search's **Annotated / Total** columns to track progress.

For shared review work, assign the saved search to a teammate. Assignment is a lightweight ownership signal; everyone can still see and open the search.

## When to Use Inline Annotations

Use inline annotations for:

- Systematic review of a trace cohort
- Ad-hoc spot checks while browsing traces
- Issue investigation
- Team review and coaching
- Extra context on traces that already have scores or flagger annotations

If you want detection without human review for a fixed set of known failure categories, use [flaggers](./flaggers).

## Inline Annotations and Issues

When creating an inline annotation, you can leave issue assignment automatic or link the annotation to an existing issue. After the annotation is finalized, failed annotations enter issue discovery automatically.

## Persisted Highlights

Message-level and text-range annotations leave highlights in the conversation view. Click a highlight to focus the matching annotation card in the panel.

## Next Steps

- [Annotations Overview](./overview): How the annotation system works
- [Flaggers](./flaggers): Automatic annotators for common failure categories
- [Search](../search/overview): Find traces to annotate
- [Issues](../issues/overview): How annotations connect to issue tracking
