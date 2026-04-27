# Domain package errors

This document standardizes how `packages/domain/*` exposes `Data.TaggedError` types and where to find them.

## Standard

- **One file per package** at `src/errors.ts` for errors that are part of the package vocabulary (shared across use-cases or exported to apps/platform).
- **Reference implementation:** `packages/domain/issues/src/errors.ts` — see also *Domain errors (`@domain/issues` reference pattern)* in [`./issues.md`](./issues.md) and [effect-and-errors](../.agents/skills/effect-and-errors/SKILL.md).
- **HTTP metadata:** every tagged error implements `HttpError` (`httpStatus`, `httpMessage`) as described in the Effect/errors skill.
- **Generic cross-cutting errors** (`RepositoryError`, `NotFoundError`, etc.) stay in `@domain/shared` (`packages/domain/shared/src/errors.ts`).

Errors that truly belong to a single use-case may live in that use-case file until a second consumer appears; then move them into `src/errors.ts` (see `AGENTS.md` domain conventions).

## Package inventory

| Package | `src/errors.ts` | Notes |
| --- | --- | --- |
| `@domain/ai` | Yes | `AIError`, `AICredentialError` |
| `@domain/api-keys` | Yes | API key lifecycle errors |
| `@domain/datasets` | Yes | Dataset/row not found, naming, trace limits |
| `@domain/email` | Yes | `EmailSendError` |
| `@domain/evaluations` | Yes (placeholder) | Add classes when use-cases need typed failures |
| `@domain/events` | — | Event payload types only; no package tagged errors today |
| `@domain/issues` | Yes | Reference pattern |
| `@domain/models` | Yes (placeholder) | Add classes when use-cases need typed failures |
| `@domain/organizations` | Yes | Membership and org admin errors |
| `@domain/projects` | Yes | `InvalidProjectNameError`, `ProjectNotFoundError` (shared shape for create/update) |
| `@domain/queue` | Yes | Queue client/publish/subscribe errors |
| `@domain/scores` | Yes | Draft score write conflicts |
| `@domain/shared` | Yes | `errors.ts` holds core domain + `CacheError` and `StorageError` |
| `@domain/simulations` | Yes (placeholder) | Add classes when use-cases need typed failures |
| `@domain/spans` | Yes | `SpanDecodingError` |
| `@domain/users` | Yes (placeholder) | Add classes when use-cases need typed failures |
| `@domain/annotation-queues` | — | No tagged errors yet |
| `@domain/annotations` | — | No tagged errors yet |

Packages not listed either have no `TaggedError` types yet or only depend on `@domain/shared` errors.

## Imports

- **Inside a domain package:** use-cases import from `../errors.ts` (or a relative path to `errors.ts`).
- **Outside the package:** import error classes from the package public API (`@domain/<name>`) when they are re-exported from `index.ts`; do not deep-import `src/errors.ts` from apps or platform code.
