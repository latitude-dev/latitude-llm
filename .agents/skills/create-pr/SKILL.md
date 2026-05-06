---
name: create-pr
description: Patterns and conventions for creating a good PR
---

# PR Description Guidelines

The work is done. Now, create a new PR for the current changes. If you're not on a new branch yet, create one first. Then, create the PR.
Treat the changes as a real deliverable. The description is the first thing anyone reading this work will see, and most readers will not read the diff line by line.

## Audience

Write for someone who:
- Is a developer on this team
- Already knows this repository and its existing architecture
- Has not seen this work before

You don't need to explain the codebase, the framework, or how things generally work in this system. You do need to explain everything *new* that this PR introduces — concepts, entities, flows, behaviors — clearly enough that the reader understands the change without opening the diff.

Cover only what's in *this* PR. If it's part of a larger effort (MVP, migration, refactor), one short line of framing is enough. Don't restate the whole project.

## Title

The title is a one-line summary of the change. Specific, declarative, imperative mood.

- Good: `Add alert incident lifecycle and worker pipeline`
- Bad: `Alert work` / `Various improvements` / `Updates to alerts module`

If the repo uses a prefix convention (`feat:`, `fix:`, scoping like `[backend]`), match it.

## What the description must convey

Every PR description, regardless of size, has to answer:

1. **What this PR does** — the actual change, in plain language
2. **Why it exists** — the problem, motivation, or unblock (skip only if the title makes it self-evident)

Beyond those two, include whatever else the reader needs to actually understand the change:

- New domain concepts introduced (entities, events, jobs, statuses, etc.): what they are, when they're created, who produces and consumes them
- Non-obvious decisions: trade-offs, why an alternative was rejected, schema or concurrency choices that aren't visible from the diff
- Deliberate scope cuts and known follow-ups
- Anything a reviewer would otherwise have to reverse-engineer from the code
- How the change was tested or validated, when relevant

If something is only interesting at the code level — naming, file moves, mechanical refactors — leave it in the diff.

## Structure

Don't follow a fixed template. The right structure depends entirely on what this PR contains.

Decide the structure by asking: *what does the reader need to know, and in what order?* Then group that information into coherent sections with headers that describe their actual content. A small bug fix might be three sentences with no headers at all. A PR introducing a new subsystem might have five sections. Both are correct when they match the change.

Order matters: start with whatever orients the reader fastest (usually a summary), put context next, push edge cases, caveats, and follow-ups toward the end.

## Linking

If related issues or PRs exist, link them. Use GitHub's keyword syntax (`Closes #123`, `Refs #456`) where appropriate.

## Style

The description should read like a senior engineer wrote it for a colleague — direct, specific, no filler. The following phrasings mark text as AI-generated and must be avoided:

- **Marketing adjectives**: "comprehensive," "robust," "seamless," "powerful," "elegant," "sophisticated," "production-ready," "first-class"
- **Hedging verbs**: "aims to," "seeks to," "strives to" — just say what it does
- **Filler verbs**: "leverages" / "utilizes" → "uses". "ensures that X" → just state X. "facilitates" → describe the actual mechanism
- **Throat-clearing openers**: "It's worth noting that," "Importantly,", "In essence,", "It should be mentioned that"
- **Closing summaries**: "In summary," "Overall," "Ultimately," — stop when you're done
- **Vague abstractions**: "provides functionality for X" → say what it does. "handles the logic of Y" → say how
- **Artificial parallelism**: "fast, clean, and reliable" — pick the one that matters
- **"Not just X but Y" construction**
- **"In order to"** → "to"
- **Restating the prompt or the section header in the first sentence of a section**

Write declaratively. "Adds X. X is created when Y happens." Not "This PR aims to introduce X, which would help with Y."

Use prose where bullets would fragment a thought. Use bullets where prose would become a wall. Don't enumerate every file changed.

Use lowercase headings unless the repo's existing PRs use a different convention.

## Output

Return the title and description as raw markdown in separate code blocks I can paste into GitHub directly. No preamble, no commentary after the blocks.

If this PR includes noticeable UI work — new views, new sections, visual changes — remind me at the end to attach screenshots or a short screen recording to the PR for reviewer context.
