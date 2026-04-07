---
name: docs
description: Review the current conversation context and git changes, then persist durable repository knowledge into `docs/*.md` by domain and into `AGENTS.md` for cross-cutting repo rules. Use after features, fixes, refactors, architecture changes, schema changes, or when the user mentions docs, documentation, design, architecture, business logic, conventions, or `AGENTS.md`.
license: LGPL-3.0
compatibility: opencode
---

# Documentation Sync

## Purpose

Use this skill to keep durable repository knowledge in sync with the current coding session.

The sources of truth are:

1. the current conversation
2. the current git changes
3. the existing `docs/*.md`, relevant `specs/*.md`, and `AGENTS.md`

This skill is for durable knowledge, not changelog prose.

## Repository docs and specs

- `docs/` contains precise and exhaustive Markdown documentation for each domain or system.
- Each docs file should cover how the domain or system is architected, built, designed, and structured.
- Keep docs organized by domain/system (for example: `docs/reliability.md`, `docs/evaluations.md`, `docs/annotations.md`, `docs/scores.md`, `docs/issues.md`, `docs/simulations.md`, `docs/organizations.md`, `docs/projects.md`, `docs/users.md`, `docs/settings.md`, `docs/spans.md`).
- `specs/` is a temporary folder used while a feature or system is under construction.
- Each spec or PRD in `specs/` should have its own Markdown file and usually include a task list to track progress.
- Specs define exactly what, how, and why to build while the feature is under construction, so temporary overlap with docs is acceptable.
- Docs should describe the intended final system after all planned phases are complete, including post-MVP phases, precisely enough to remain authoritative after the corresponding spec is deleted.
- Docs should not be written as a snapshot of the repository's currently implemented state.
- If some part of the final design is still not fully specified, docs may say that the exact detail is still pending precise definition, but they should still be framed around the final intended system.
- When working on a spec, proactively ask clarifying questions and challenge assumptions, gaps, ambiguities, and trade-offs as needed to build the best possible spec.

### Spec structure

Use this structure for specs:

```markdown
# Name

> **Documentation**: `docs/reliability.md`, `docs/evaluations.md`, ...

... (here goes the exact and precise specification and the plan)

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase N - ...

- [ ] **P0-1**: ...

... (here goes more tasks)

**Exit gate**:

- ... (here goes the definition of complete for this phase)

... (here goes more phases)
```

- Each phase should usually map to its own GitHub PR, and each task inside should be a subtask of that PR.
- When implementation stabilizes, promote durable knowledge from `specs/` into `docs/`.
- Building the related `docs/` for the current spec is recommended.
- Optionally, each phase can be linked to a Linear task if configured by the user.

## When to use this skill

Use this skill automatically before finishing a task when the session introduced, removed, or clarified durable knowledge such as:

- product behavior
- domain rules or business logic
- architecture or design changes
- repository structure or ownership changes
- schema, API, storage, query, or lifecycle changes
- explicit conventions, constraints, or prohibitions agreed in the conversation

Use it when the user explicitly asks to:

- update docs
- document the changes
- sync knowledge into `docs/`
- update `AGENTS.md`
- capture design, architecture, or business logic decisions

If there is no durable knowledge change, do not edit docs just to summarize work. Say that no documentation update is needed.

## Workflow

### 1. Inspect the session first

- Read the current conversation carefully.
- Extract durable decisions, not just code edits.
- Note additions, removals, renames, behavior changes, and explicit rules.
- Use the conversation as the filter for what belongs to the current session.

If the worktree contains unrelated changes, do not document them unless the user asked you to.

### 2. Inspect the repository evidence

- Review `git status` and `git diff`.
- Read the changed files that carry domain or architectural meaning.
- Compare code changes against the existing docs before editing them.
- If a relevant spec exists, read the sections that define the domain language and future-state behavior.

### 3. Classify the knowledge

- `docs/`: domain or system knowledge about behavior, architecture, structure, responsibilities, interfaces, lifecycle, and business logic.
- `AGENTS.md`: stable repo-wide rules, conventions, constraints, and prohibitions that future agents should follow across sessions.
- `specs/`: temporary plans. Do not move speculative or incomplete ideas into `docs/` unless the implementation or the conversation made them durable truth.

### 4. Map changes to the correct docs

- Prefer updating existing domain docs first.
- Update every impacted doc, not only the most obvious one.
- Delete or rewrite stale sections when behavior was removed or replaced.
- Create a new doc in `docs/` only when the knowledge is durable and no existing doc is a reasonable home.

### 5. Write future-state documentation

- Document the repository as it should now be understood after the change.
- Explain the model, responsibilities, invariants, flows, and important constraints.
- Prefer precise durable statements over implementation trivia.
- Organize by domain, not by commit chronology.
- Avoid changelog wording such as "we changed", "in this PR", "recently", or dates.

### 6. Escalate repo-wide rules into `AGENTS.md`

Add or update `AGENTS.md` when the session established a general rule that should guide future agent work across the repository.

Good candidates include:

- architecture boundaries
- naming or file organization conventions
- storage or query constraints
- migration or schema rules
- testing rules
- prohibited patterns
- any cross-cutting repo decision

Example: "Do not add foreign key constraints" belongs in `AGENTS.md`.

Do not add narrow feature details that belong in a domain doc instead. If it is unclear whether a rule is repo-wide and durable, ask the user before editing `AGENTS.md`.

### 7. Verify

- Re-read the edited docs and `AGENTS.md`.
- Confirm they match the code and do not contradict existing guidance.
- Make sure removed behavior is no longer documented.
- Tell the user which docs changed and why, or that no documentation updates were needed.

## Durable knowledge filter

Persist knowledge only if it is likely to matter after this session:

- accepted behavior and user-facing semantics
- domain concepts and relationships
- important architecture and ownership boundaries
- repository-wide conventions and prohibitions
- data model, storage, and query behavior
- operational constraints that affect future work

Do not persist:

- temporary debugging notes
- one-off commands or local environment accidents
- rejected ideas
- task-by-task changelog summaries
- TODO lists unless the user asked for a spec or plan

## Domain mapping hints

Use the closest existing doc when possible:

- `docs/reliability.md`: cross-cutting reliability system design
- `docs/evaluations.md`: evaluation lifecycle and behavior
- `docs/annotations.md`: annotation model and flows
- `docs/annotation-queues.md`: queueing and assignment behavior for annotations
- `docs/scores.md`: scoring logic and score lifecycle
- `docs/issues.md`: issue detection, grouping, and issue workflows
- `docs/simulations.md`: simulation concepts and flows
- `docs/organizations.md`: organization tenancy and membership rules
- `docs/projects.md`: project structure and project-scoped behavior
- `docs/users.md`: user identity and user lifecycle
- `docs/settings.md`: configuration and settings behavior
- `docs/spans.md`: span ingestion, storage, and query semantics
- `docs/repositories.md`: repository port naming, standard verbs, audit of domain ports

If a change spans multiple domains, update multiple docs.

## Writing rules

- Keep docs exhaustive, precise, and future-state.
- Prefer the domain language used by the code and specs.
- Explain responsibilities and invariants, not every function.
- When behavior was removed, delete or rewrite the old documentation.
- When conversation decisions are broader than one domain, update both `docs/` and `AGENTS.md` if appropriate.
- Keep `AGENTS.md` prescriptive and reusable by future coding agents.

## Quick checklist

- [ ] I checked both the conversation and the git changes.
- [ ] I filtered out unrelated worktree changes.
- [ ] I identified durable additions, removals, and rule changes.
- [ ] I updated the right `docs/*.md` files by domain.
- [ ] I removed or rewrote stale documentation.
- [ ] I updated `AGENTS.md` for any new repo-wide durable rule.
- [ ] I avoided changelog-style wording.
- [ ] I told the user what documentation changed, or that none was needed.
