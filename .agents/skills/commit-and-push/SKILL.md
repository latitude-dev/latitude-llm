---
name: commit-and-push
description: Commit and push git changes using Conventional Commits. Use when the user asks to commit, commit and push, push changes, or prepare changes for a PR after committing.
---

# Commit And Push

## Workflow

1. Inspect the working tree
   - Run `git status --short`, `git diff`, and `git log -5 --oneline`.
   - If there are no changes, stop and report that there is nothing to commit.

2. Decide commit boundaries
   - If changes are unrelated, split into multiple commits.
   - If intent is unclear, ask for guidance before staging.

3. Stage intended changes
   - Use explicit `git add <paths>` (avoid interactive flags).
   - Never stage files that likely contain secrets unless explicitly requested.

4. Review the staged diff
   - Run `git diff --staged` and confirm it matches the intended scope.

5. Write a Conventional Commit message
   - Format: `type(scope): short summary`.
   - Add an extensive body explaining the why and major changes.
   - Use valid types (feat, fix, refactor, chore, docs, test, build, ci, perf, style).

6. Commit and push
   - Commit with `git commit -m "..." -m "..."`.
   - Push with `git push` (or `git push -u origin <branch>` if needed).

## Conventional Commit Examples

- `feat(clickhouse): add evaluation results dual-write`
- `fix(web): handle missing project`
- `refactor(core): split evaluation result writes`
- `docs(readme): update setup steps`
- `chore(ci): cache golang-migrate`

## Extensive Description Examples

```
feat: Write spans to Clickhouse
Introduces the ClickHouse spans table migration, a typed client wrapper,
and feature-flagged dual-write in processSpansBulk. Postgres remains
authoritative; ClickHouse writes are fire-and-forget behind the
'clickhouse-spans-write' flag. No read path changes yet.
```

```
refactor: Add function-based query abstraction to consolidate read logic
Introduces `scope()` and `unsafeScope()` primitives in `packages/core/src/queries/`
that replace the class-based repository pattern for reads. The key improvement is
that `scope.where(...)` automatically composes tenancy filters, eliminating the
repeated `and(this.scopeFilter, ...)` pattern from V2 repositories.

Phase 1: migrates projects (tenanted) and users (both tenanted and non-tenanted)
as proof of concept. Old repositories bridge to new functions, allowing incremental
migration of remaining call sites.
```

## Guardrails

- Do not amend commits unless the user explicitly requests it.
- Do not use `--no-verify`, `--force`, or `--force-with-lease` unless requested.
- If the branch is behind, use `git pull --rebase` and re-run the commit if needed.
- If a hook fails, fix the issue and create a new commit (do not amend).
