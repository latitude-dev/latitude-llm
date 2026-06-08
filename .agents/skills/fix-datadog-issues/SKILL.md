---
name: fix-datadog-issues
description: >-
    Find, triage, and fix production errors captured by Datadog Error Tracking,
    then open a PR. Use when asked to look at "Datadog issues/incidents/errors",
    "find and fix bugs from Datadog", investigate the most-frequent or newest
    production errors, or work a specific Datadog Error Tracking issue.
---

# Fix Datadog Error Tracking issues

This skill takes a brand-new agent from "look at Datadog" all the way to a reviewable PR.
You will run it repeatedly across **separate, context-free sessions**, so it is written to be
restartable: a fixed error simply stops receiving occurrences, and (when the tooling allows) you
leave a comment on the issue so the next agent does not redo your analysis.

The Datadog MCP server is `plugin:datadog:mcp`. Its tools are **deferred** — their schemas load on
demand. Load them with `ToolSearch` (e.g. `select:mcp__plugin_datadog_mcp__aggregate_spans`) before
calling, and run the server's skill-discovery first (see §1).

---

## The pipeline (overview)

```
0. Setup & disambiguate  →  1. Navigate Datadog  →  2. Pick an issue  →  3. Root-cause in code
   →  4. ⛔ CONFIRM PLAN WITH USER  →  5. Reproduce with tests + fix  →  6. Comment on the issue  →  7. PR to development
```

**Hard gate at step 4:** you investigate freely, but you **do not** write a fix, create a branch, or open
a PR until the user has seen your plan and approved it (see §4). The only exception is explicit
pre-authorization (e.g. "just fix it and PR").

Do **not** try to fix every issue. Scope a PR by size/risk (see §2.4): one big/critical bug = its own
PR; a few small, independent, related bugs may share one PR (cap ~4).

---

## 0. Setup and critical disambiguations

Read these first — each one was a real wall that cost time.

- **"Incidents" almost always means Error Tracking *issues*, not Incident Management.**
  Datadog Incident Management (`search_datadog_incidents`) is typically **empty (0)** here, and incidents
  have no "occurrences". When the user says incidents / issues / errors / "most occurrences" / "newest",
  they mean **Error Tracking** (errors grouped into issues, with occurrence counts and trends).

- **Only v2 services are fixable from this repo.** This repo (`latitude-v2`, trunk `development`) owns:
  `api`, `ingest`, `web`, `workers`, `workflows`.
  The **`latitude-llm-*`** services (`latitude-llm-web`, `latitude-llm-workers`, `latitude-llm-gateway`, …)
  are the **legacy v1** codebase (branch `latitude-v1`) — **out of scope** unless the user says otherwise.
  Derive the live v2 list from `ls apps/` so it never goes stale.

- **Production only.** Filter `env:production`. Error Tracking buckets by `env`; staging issues exist
  separately (`env:staging`) but are out of scope unless the user hands you a specific staging issue.

- **The Latitude MCP server (`mcp__latitude__*`) is NOT this.** `mcp__latitude__listIssues` /
  `getIssue` / `resolveIssues` operate on issues detected in *Latitude customers' LLM traces* — a
  different product surface. Never use them to triage our own app's runtime errors. Use
  `plugin:datadog:mcp`.

- **Error Tracking toolset must be enabled.** This skill needs the `error-tracking` toolset (stable,
  not on by default). If `ToolSearch` for `datadog error tracking issue` finds no
  `mcp__plugin_datadog_mcp__*error_tracking*` tools, the toolset is off — tell the user to enable it via
  the `/datadog:ddtoolsets` skill (add `error-tracking`), then `/reload-plugins` + re-auth. You can still
  do everything *except* read/write issue objects directly via the **span fallback** in §1.3.

---

## 1. Navigating Datadog

### 1.1 Always start with skill discovery
The server ships domain guides that are not visible in tool names. In parallel:
- `load_datadog_skill(skill_name="datadog/traces")` — span query syntax & attributes.
- `list_datadog_skills(query="error tracking ...")` — find the right guide.
Load `datadog/logs` if you pivot to logs. Skip re-loading a guide you already loaded this session.

### 1.2 The lay of the land
- **Org/site:** `datadoghq.eu` (UI: `app.datadoghq.eu`, MCP domain `mcp.datadoghq.eu`).
- **Services:** `search_datadog_services` lists everything (apps, DB adapters like `*-postgres`/`*-aws-s3`,
  and external hosts like `api.openai.com`). Only the bare v2 app names matter here.
- **`service.version` == git commit SHA.** Every span tags the deployed SHA. This is gold: it maps an
  error to a commit and lets you correlate with deploys via `get_change_stories`.

### 1.3 Where Error Tracking issues live, and how to read them
An **issue** is a fingerprinted group of error occurrences. Two ways in — use both:

**(a) Error Tracking tools (preferred; needs the toolset).** Discover exact names at runtime:
`ToolSearch(query="datadog error tracking issue")`. Expect at least `get_datadog_error_tracking_issue`
(by issue id) and a list/search tool; there may be an **update/state** and/or **comment** tool — confirm
their real names/schemas before relying on them (see §6).

**(b) Span aggregation (always works, even with the toolset off).** Issues are stamped onto error spans:
- `custom.issue.id` — the issue UUID (fetch with `custom_attributes:["issue.*"]`).
- `issue.first_seen` (epoch ms), `issue.first_seen_version` (git SHA of first occurrence), `issue.age`.
- Plus `@error.type`, `@error.message`, `error.stack`, `resource_name`, `service`, `env`.

**Find the heavy hitters** (the workhorse query):
```
aggregate_spans(
  query   = "status:error env:production",
  from    = "now-7d", to = "now",
  computes= [{field:"*", aggregation:"COUNT", output:"count", sort:"desc"}],
  group_by= {fields:["service","@error.type"], limit:40}
)
```
Then narrow into messages/resources for the candidates you care about:
```
aggregate_spans(query="service:workers status:error env:production @error.type:(TypeError OR RepositoryError)",
  group_by={fields:["@error.message","resource_name"], limit:25}, computes=[COUNT desc])
```
**Read raw detail** (stack, http, issue id) for a specific group:
```
search_datadog_spans(
  query = "service:web status:error env:production @error.type:Error resource_name:GET",
  custom_attributes = ["error.*","http.*","issue.*"], max_tokens = 7000)
```

**Link to an issue** (needed in the §4 report and the §7 PR). Prefer the canonical URL the error-tracking
tool returns. Otherwise build it from the org base + issue id and open it to confirm it resolves:
`https://app.datadoghq.eu/error-tracking/issues/<issue.id>`. (Span search responses also return a
`base_url` and a `traces_explorer_url` you can fall back to.)

### 1.4 Query pitfalls (these bit us)
- **`@error.message` is not reliably wildcard/full-text searchable.** `@error.message:"foo*"` may return 0.
  Instead **group by `@error.message`** in `aggregate_spans`, or filter by `@error.type` + `resource_name`
  and read messages from raw spans.
- Reserved attrs take **no `@`**: `service`, `resource_name`, `status`, `type`, `trace_id`. Span attrs take
  `@`: `@error.type`, `@http.status_code`, `@duration` (**nanoseconds!**).
- Group multi-values: `@error.type:(A OR B)`, not `@error.type:A OR @error.type:B`.

---

## 2. Pick an issue

### 2.1 If the user named an issue
Target it directly (by issue id/slug/url, or a quoted error message → resolve via the queries above).
Skip the ranking; go to §3.

### 2.2 Otherwise: the funnel (classification *before* ranking)
**Occurrence count alone is a trap.** Most high-count "errors" are not fixable code bugs. Filter first.

**Stage A — scope gate (cheap, 1–2 aggregate calls):** v2 service, `env:production`, `status:error`,
`now-7d`. Inspect the **top ~15** by count. Ignore issues with **< 5 occurrences** in the window unless
they are new+rising or user-specified (sub-5 are usually non-reproducible one-offs).

**Stage B — classify each candidate** (read its message + stack). Bucket it:

| Class | Signatures (examples) | Default action |
|---|---|---|
| **A. Genuine code bug** | `TypeError`, null/undefined deref, validation/logic errors, data-handling (bad UTF-8 / lone surrogates, encoding, parsing) | **Candidate to fix** |
| **B. Infra / transient** | `Timeout`, `socket hang up`, `ECONNRESET`, `deadlock detected`, `timeout exceeded when trying to connect`, 429, 503, pool exhaustion | Usually **not** a code fix. Note & skip (resilience/retry work only if asked) |
| **C. Deploy / version skew** | "Server function info not found for `<hash>`", "Failed to fetch dynamically imported module" (old `first_seen_version` ≠ current `service.version`; stale client tabs) | Framework-level graceful handling, **not** a logic bug |
| **D. Expected / not-an-error** | BullMQ `DelayedError`, `*LockUnavailableError` that is retried with backoff, a `NotFoundError` that callers handle | **Noise** — ignore |
| **E. Upstream / third-party** | external provider 5xx, provider rate limits with correct handling | Not ours |

Only **Class A** proceeds. For B–E: leave a one-line verdict comment on the issue if you can (§6), then skip.

**Stage C — rank the Class-A bugs** on three axes, then pick the top:
1. **Impact** — customer-facing (`web`/`api`) > background (`workers`/`workflows`); data corruption/loss >
   transient failure; *silent-wrong* > *loud-fail*; does it block a user flow?
2. **Volume × trend** — occurrences **and** direction. Use the 14-day trend; rising/new beats flat/decaying.
3. **Fix confidence × blast radius** — clear, bounded root cause + small change = high ROI; sprawling or
   unknown = defer.

Pick = highest **(impact × trend)** among the **confidently fixable**.

### 2.3 The recency premium (catch regressions early)
Give extra weight to **new + rising** issues even at lower absolute count:
- "New" = `issue.first_seen` within **~72h**, OR `first_seen_version` is one of the **last 1–2 deploys**.
- A recent first-seen usually means a fresh regression — `first_seen_version` + `get_change_stories`
  often hand you the **culprit commit**, making the fix faster and higher-confidence, and catching it
  early prevents pile-up. An ancient, flat, high-count issue is a yellow flag, not an automatic top pick.

### 2.4 How many to fix / how to batch
- **Solo PR** if: critical or large; touches core/shared code; or the root cause is non-trivial.
- **Group 2–4** into one PR only if **all** are: small, independent, low-risk, **and** thematically
  related (same subsystem → one reviewer context). Never mix a risky fix with trivial ones. Cap ~4.

---

## 3. Root-cause in code

Use the `analyze-problem` skill's method. Then, specific to this workflow:

- **Generalize past the observed symptom.** One issue is often one *instance* of a broader bug. Example:
  a Voyage embeddings `400 invalid UTF-8` and a ClickHouse `missing second part of surrogate pair` were
  **one** root cause — unsanitized lone UTF-16 surrogates hitting two sinks. Fix the **source**, not each
  sink, and look for **sibling call sites** with the same flaw.
- **Map the error to code from the span:** `service` → `apps/<svc>`; `resource_name` (e.g. bullmq
  `process <queue>`, or `GET /…`) → the handler/job; `error.stack` frames → the throwing module. Confirm
  the deployed SHA (`service.version`) matches what you're reading.
- **Find the commit that introduced it.** `issue.first_seen_version` is the git SHA of the first
  occurrence — the deploy that introduced the regression. Once you've located the faulty line(s), run
  `git blame`/`git log -S '<symbol>' -- <file>` to name the culprit commit, and `get_change_stories`
  to see that deploy in context. Capture both the `file:line` and the commit SHA — §4 asks for them.
- **Decide fixability honestly.** If it's Class B/C/D/E in disguise, or the fix needs product/infra
  decisions beyond code, say so and record it (§6) instead of forcing a fake fix.
- Respect the architecture (`architecture-boundaries`): fix at the right layer (domain use-case vs
  platform adapter vs app boundary). Prefer the layer the codebase already uses for that concern — search
  for an existing helper before writing a new one.

---

## 4. Checkpoint — confirm the plan with the user (do not skip)

**Stop here. Do not write a fix, create a branch, or open a PR until the user approves.** This is a hard
gate: everything up to now is read-only investigation. Report back with a concise plan and wait.

Present it in this order — be organized, not a wall of text:

1. **Issues found** — a short list (table is fine) of the candidates from §2. For each, give:
   the error signature, the service, occurrences + 14-day trend, the class (§2.2), a **link to the Datadog
   issue** (§1.3), and a **one-line description of what it actually is** — not just the raw message.
   Make clear which ones you ruled out and why.
2. **What you're focusing on** — the issue(s) you chose and **why** (impact × trend × confidence), plus
   what you deliberately skipped with the class reason (infra / version-skew / not-an-error / upstream).
3. **Hypothesis** — for each chosen issue, the root cause in plain language, backed by concrete evidence:
   - **`file:line` references** to the code at fault (and sibling call sites if it generalizes);
   - the **commit that introduced it** where you can find it (`issue.first_seen_version` + `git blame` /
     `git log -S`, §3) — link it as `<repo>/commit/<sha>`;
   - whether this issue is one instance of a broader bug.
4. **Proposed fix** — what you'll change, at which layer, the blast radius, and the **test plan**
   (the reproduction plus the novel cases you'll add).
5. **PR plan** — single PR vs grouped (per §2.4), and the base branch (`development`).
6. **Assistance needed / blockers** — anything you need from the user, asked explicitly: ambiguous intent,
   a product/infra decision, missing access (e.g. the error-tracking toolset is off), an issue that looks
   **unfixable in code**, or a fix that turned out larger/riskier than expected.

Then **wait for confirmation** and adjust the plan to their feedback before proceeding to §5.

**Pre-authorization escape hatch:** if the user already said to fix and open the PR without checking back
(e.g. "just fix it and PR", or a non-interactive/scheduled run with standing approval), state the plan
briefly and proceed — but still **stop and ask** if you hit a blocker, an ambiguous choice, or a fix
materially larger or riskier than what you described.

---

## 5. Reproduce with tests, then fix

**Tests first, and broader than the single failure.**
1. Write a failing test that reproduces the bug **and** new, *different* inputs that exercise the same
   root cause (not just the one occurrence you saw). This both pins the bug precisely and guards the
   general case. Follow the `testing` skill (Vitest layers, PGlite/chdb testkit, `/testing` exports;
   **don't** `vi.mock` repositories — use fakes/testkit).
2. Confirm the test **fails** without the fix (sanity-check it actually targets the bug — temporarily
   revert the fix or assert the pre-fix behavior).
3. Apply the fix at the root cause.
4. Confirm the new tests **pass**, and existing tests still pass:
   `pnpm --filter <pkg> test`.
5. Typecheck + lint the changed packages — **never run `tsc`**:
   `pnpm --filter <pkg> typecheck` (tsgo) and `pnpm exec biome check <files>`.

**Environment gotcha:** a fresh git worktree may have **no `node_modules`** (`vitest: command not found`,
"node_modules missing"). Run `pnpm install` at the repo root first (per `toolchain-commands`); if scripts
need `node`/`pnpm` in child shells, `eval "$(mise env)"`.

---

## 6. Record on the issue (so the next agent doesn't redo it)

Triage state lives **in Datadog**; there is no external ledger. Policy (decided with the team):

- **Comment when the PR is created.** If an Error Tracking **comment** tool exists (discover via
  `ToolSearch(query="datadog error tracking ... comment")` and verify its schema), post a short note on
  the issue: what the root cause was and the **PR link**. For Class B–E issues you investigated and chose
  not to fix, comment the **verdict + reason** ("infra timeout, not a code bug", "version skew", etc.) so
  no one re-investigates.
- **Do not auto-resolve.** A fixed error simply **stops receiving occurrences** after the deploy — that is
  the real signal. Marking "Resolved" before deploy would hide something still firing. (Only resolve if
  the user explicitly asks.)
- **If no comment/write tool is available** (toolset off or tool absent): skip recording. Open issues are
  re-discovered next run; fixed ones go quiet. Don't invent an external tracker.

> The exact error-tracking write tool names/schemas weren't loadable when this skill was written. Always
> discover and verify them at runtime before calling — don't assume a signature.

---

## 7. Create the PR

Follow the **`create-pr`** skill for the description. Specifics for this workflow:

- **Base branch = `development`** (v2 trunk). Verify ancestry before opening
  (`git merge-base --is-ancestor origin/development HEAD`); never base on `main`.
- Branch first if you're on `development`/detached.
- In the description, include:
  - The **Datadog issue(s)** addressed — **always a link per issue** (§1.3), with its error signature and
    occurrence/trend context. Link the **introducing commit** too when you found it (§3).
  - **Root cause** in plain language, and why the fix is at *this* layer (note if it generalizes beyond
    the observed symptom / fixes sibling call sites).
  - The **tests** added and that they fail-without / pass-with the fix.
  - **Verification steps** to confirm the fix — typically: "after deploy, occurrences of issue `<id>`
    should drop to zero," plus how to reproduce locally.
- If you grouped multiple issues, list each with its own root-cause line.

---

## Appendix A — Worked example (the surrogate bug)

- **Symptoms:** `workers` `AIError` "Embedding failed (voyage-4-large): 400 … input … valid UTF-8 …
  special characters properly escaped" (15×) **and** `RepositoryError` "Cannot parse escape sequence:
  missing second part of surrogate pair … value of key `summary`" (3×). Ranked ~15th by volume — **not**
  the top occurrence count.
- **Classification:** the top groups were noise — `DelayedError` (D), `*LockUnavailableError` (D),
  `RepositoryError: socket hang up/Timeout/deadlock` (B), `web` "Server function info not found" (C).
- **Root cause (generalized):** lone UTF-16 surrogates (from arbitrary LLM I/O and from length-sliced
  previews splitting an emoji's surrogate pair) flowed unsanitized into **two** sinks — ClickHouse JSON
  insert and the Voyage API.
- **Fix:** sanitize at the source (`packages/domain/taxonomy/.../record-session-observation.ts`) with the
  existing tested helper `stripLoneSurrogates` (`@domain/spans`), covering both short- and long-session
  paths — mirroring how `build-trace-search-document` already handles the identical ClickHouse constraint.
- **Tests:** added a case feeding lone surrogates, asserting the embed input **and** the persisted summary
  are sanitized; confirmed it fails without the fix.

## Appendix B — Command cheatsheet

```
# Confirm the toolset / discover error-tracking tools
ToolSearch "datadog error tracking issue"
ToolSearch "select:mcp__plugin_datadog_mcp__aggregate_spans,mcp__plugin_datadog_mcp__search_datadog_spans"

# Are there *incident-management* incidents? (usually 0 — then it's Error Tracking)
search_datadog_incidents(query="state:(active OR stable)")

# Heavy hitters by service + error type (last 7d, prod)
aggregate_spans(query="status:error env:production", from="now-7d",
  computes=[{field:"*",aggregation:"COUNT",output:"count",sort:"desc"}],
  group_by={fields:["service","@error.type"],limit:40})

# Drill into messages/resources for chosen services
aggregate_spans(query="service:web status:error env:production @error.type:(Error OR TypeError)",
  computes=[{field:"*",aggregation:"COUNT",output:"count",sort:"desc"}],
  group_by={fields:["@error.message","resource_name"],limit:25})

# Read stacks + issue ids
search_datadog_spans(query="service:workers status:error env:production @error.type:RepositoryError resource_name:\"process taxonomy\"",
  custom_attributes=["error.*","issue.*"], max_tokens=8000)

# Correlate a fresh regression with deploys
get_change_stories(service_name="web", env="production", start_ts=..., end_ts=..., story_types=["deployment"])

# Verify a fix locally
pnpm install                      # if node_modules missing in the worktree
pnpm --filter <pkg> test
pnpm --filter <pkg> typecheck     # tsgo — never `tsc`
pnpm exec biome check <changed-files>
```

## Related skills
`analyze-problem` (root-cause method) · `testing` (Vitest/testkit) · `create-pr` (PR description) ·
`architecture-boundaries` (which layer to fix in) · `database-clickhouse` & `effect-and-errors`
(common error sources) · `toolchain-commands` (install/run/env) · `/datadog:ddtoolsets` (enable the
`error-tracking` toolset).
