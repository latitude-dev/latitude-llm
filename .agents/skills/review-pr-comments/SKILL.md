---
name: review-pr-comments
description: >-
  Triages a PR with GitHub CLI: loads issue-level and inline review feedback (gh pr
  view, gh api REST, gh api graphql as appropriate), walks items in order, replies in
  the correct thread, optional resolve. Groups duplicate comments into one fix. Use when
  addressing PR review comments, Copilot inline threads, or babysitting PR feedback.
---

# PR comments: sequential review workflow

Walk the **current** PR’s feedback in **order**, one **topic** at a time. Treat each **comment** as something to read and answer; treat each **underlying issue** as something to fix **once**. If several comments say the same thing (or the first fix already covers a later remark), **do not** redo the same code work—use **one commit** for that shared fix and **reply on each** later comment pointing at that commit (e.g. “Addressed in `<sha>` — same fix as …”).

## Prerequisites

- `gh` authenticated (`gh auth status`).
- A PR for the checked-out branch (`gh pr view` without a number targets it).
- Follow repo rules for **git write**: do not commit or push unless authorized for this session.

## Pick the best `gh` command per step

`gh pr …`, **`gh api`** (REST), and **`gh api graphql`** hit **different** GitHub APIs—same intent, **not** interchangeable. There is **no** blanket rule favoring one surface; choose whatever is **correct and clearest** for that action.

| Step | Typically strongest option | Why |
| --- | --- | --- |
| Quick PR metadata | `gh pr view --json number,url,title,…` | Native fields, branch defaults |
| Readable timeline + review summaries | `gh pr view --comments` | Human-readable; good scan |
| Structured issue comments / review objects | `gh pr view --json comments,reviews,latestReviews` | Easy JSON for sorting |
| Inline comments **plus** threads, resolve state | `gh api graphql` (`reviewThreads`) | Threads + `isResolved` + `thread.id` for mutations |
| Flat list of inline comments only | `gh api repos/{owner}/{repo}/pulls/<n>/comments --paginate` | Simple; reply ids (`id`) for REST replies |
| Post a **conversation** comment | `gh pr comment` | Correct for timeline |
| Reply **under a line comment** | `gh api -X POST …/pulls/comments/<id>/replies` | `gh pr comment` does not thread on the diff |
| Resolve a review thread | `gh api graphql` (`resolveReviewThread`) | Only API that exposes it |
| Inspect the patch | `gh pr diff` | First-class diff |
| Need UI context (complex thread) | `gh pr view --web` | When it helps—no ban |

Facts that drive the choice (not preferences): **`gh pr view` does not return inline `PullRequestReviewComment` payloads in JSON** (see §2.1)—load those with **REST or GraphQL** or you will miss most line-level review and Copilot feedback.

## 1. Resolve the PR

From the repo root:

```bash
gh pr view --json number,url,title,headRefName,baseRefName
```

If no PR exists for the branch, stop and tell the user.

## 2. Load **all** review artifacts (do not skip inline)

Build a full work list before changing code. **Most reviewer and Copilot feedback is on `PullRequestReviewComment` (inline on the diff), not in issue comments.** If you only run `gh pr view`, you will miss that feedback.

### 2.1 What `gh pr view` **does** and **does not** include

| Source | What you get |
| --- | --- |
| `gh pr view --comments` | Renders **issue-level** conversation comments and **review submission summaries** (the body of each review). It does **not** list individual **inline** line comments. A review that says “Copilot generated 1 comment” only references that inline comment—the **inline text is not in this output**. |
| `gh pr view --json comments` | **Issue / timeline** comments on the PR only. Often **empty** when all feedback is inline. |
| `gh pr view --json reviews,latestReviews` | **Submitted review metadata and review bodies** (summary text), **not** the per-line `PullRequestReviewComment` payloads. |

`gh pr view --help` lists JSON fields such as `comments`, `reviews`, `latestReviews`, `reviewRequests`—there is **no** field for inline review comments or `reviewThreads`. **No `gh pr` subcommand exposes `GET /repos/.../pulls/{pr}/comments`.**

**Conclusion:** after only `gh pr view`, you are **still blind** to inline comments until you also load **`PullRequestReviewComment`** data (REST or GraphQL below).

### 2.2 Inline review comments (required — pick the best fetch)

You **must** load inline comments every time; **`gh pr` alone cannot.** Choose one or combine:

**A — GraphQL:** best when you want **threads** (`id`, `isResolved`), **grouping**, inline bodies **path / line / author**, and **`thread.id`** for resolve—in one shaped query.

Resolve `owner` and `repo` once (examples):

```bash
gh repo view --json owner,name -q '"\(.owner.login)/\(.name)"'
# or: OWNER=$(gh repo view --json owner -q .owner.login); NAME=$(gh repo view --json name -q .name)
```

Example query (raise `first` / paginate if the PR is huge):

```bash
gh api graphql -f query='
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
          comments(first: 50) {
            nodes {
              databaseId
              body
              path
              line
              createdAt
              author { login }
            }
          }
        }
      }
    }
  }
}' -f owner='OWNER' -f name='REPO' -F number=PR_NUMBER
```

If `pageInfo.hasNextPage` is true, follow with additional requests using `after:` cursors on `reviewThreads` (same pattern as standard GraphQL pagination).

Use **`thread.id`** (Node id) for **§3.7 resolve**. Use each comment’s **`databaseId`** as the REST **`id`** when posting **`.../pulls/comments/{id}/replies`** (they are the same numeric id GitHub uses in the REST API).

**B — REST:** flat list of every inline comment—minimal mental overhead; each node has `id` for **`.../replies`**.

```bash
gh api "repos/{owner}/{repo}/pulls/PR_NUMBER/comments" --paginate
```

Each item includes `id`, `body`, `path`, `line`, `in_reply_to_id`, `created_at`, `html_url`, etc. **No thread grouping or `isResolved`**—prefer **A** when you need those.

### 2.3 Issue-level and summary context

Use **`gh pr`** where it is strongest (readable + structured issue/review summaries):

```bash
gh pr view [<PR_NUMBER>] --comments
gh pr view [<PR_NUMBER>] --json comments,reviews,latestReviews
gh pr diff [<PR_NUMBER>]
```

### 2.4 Merge into one ordered work list

Combine **issue/timeline comments** (from JSON or `--comments`) with **every inline comment** (from **§2.2**). Normalize timestamps and sort **chronologically** (oldest first) unless the user specifies otherwise. When using GraphQL threads, flatten `reviewThreads → comments` for ordering, but keep **`thread.id`** handy for resolve and for understanding **which replies belong together**.

**Duplication:** **cluster** items that ask for the same change; **implement once** and **reply to each** comment in that cluster.

## 3. Process comments in order (one pass, dedupe fixes)

For **each** item in chronological order:

### 3.1 Read

Combine whatever helps: **`gh pr view`** output, **`gh api`** / **GraphQL** payloads, **`gh pr diff`**, and **`gh pr view --web`** if the UI makes thread context obvious. Goal is **complete understanding**, not a specific subcommand.

### 3.2 Interpret

Classify: change request, question, nit, or discussion. Note which files/behavior it touches.

### 3.3 Judge

Decide if it is right, unclear, or you disagree. Skip or discuss without code when appropriate.

### 3.4 Implement (when needed)

If this comment’s **underlying issue** is **already fixed** by a commit you made for an **earlier** comment in this run, **do not edit the code again**—go to **3.6** and reply that it is covered.

Otherwise, apply **only** that scoped fix. Same cluster → **one** commit for that cluster.

### 3.5 Commit and push

- **Single distinct issue** (possibly mentioned by several comments): **one commit**; push when ready.
- **Separate issues:** separate commits.

After pushing, capture **commit SHA** (e.g. `git rev-parse HEAD`) for replies.

### 3.6 Reply in the right place

**Timeline / issue comment** — `gh pr comment` is the right surface:

```bash
gh pr comment [<PR_NUMBER>] --body '...'
```

**Inline thread** — REST reply endpoint (only reliable way to nest under the line):

```bash
gh api -X POST "repos/{owner}/{repo}/pulls/comments/<COMMENT_ID>/replies" -f body='...'
```

`<COMMENT_ID>` is the REST **`id`** / GraphQL **`databaseId`** of the comment you answer (from **§2.2**).

**Formal review summary** when it fits the workflow:

```bash
gh pr review [<PR_NUMBER>] --comment -b '...'
```

Duplicate-addressed items: short replies (“Same fix as … in `<sha>`.”).

### 3.7 Resolve review threads (optional)

When appropriate (fixed, declined with closure, etc.—not open questions): **GraphQL** is the API that supports resolve. Use **`thread.id`** from **§2.2 A**:

```bash
gh api graphql -f query='
mutation($id: ID!) {
  resolveReviewThread(input: { threadId: $id }) {
    thread { isResolved }
  }
}' -f id=<THREAD_ID>
```

If you only used REST **B**, fetch thread ids via a **GraphQL** query once, or resolve in the **browser**—either is fine if it matches team practice.

## 4. Tracking progress

- Comments answered vs open.
- Which **commit SHA** fixed which cluster.

## Anti-patterns

- **Treating `gh pr view` as sufficient** for “all PR comments”—you still need **inline** data from **REST or GraphQL** (§2.1–2.2).
- Mixing **unrelated** fixes into one commit.
- Silent pushes with no reply (**timeline** and/or **`.../replies`**).
- Using **`gh pr comment`** where a **REST threaded reply** was needed (feedback belongs on the diff line).
- Resolving threads that are still active debate.

**Not** an anti-pattern: **one commit** for several comments that share the **same** issue; reply on each item with pointers to that commit.

## Related

- Creating issues from gaps: [gh-issue](../gh-issue/SKILL.md).
