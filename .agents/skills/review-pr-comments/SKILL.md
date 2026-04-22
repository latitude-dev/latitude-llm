---
name: review-pr-comments
description: >-
  Loads issue-level feedback via gh pr view and mandatory inline review comments via gh
  api (REST or GraphQL reviewThreads), then walks feedback in order with correct threaded
  replies. Groups duplicate comments into one fix. Use when triaging PR reviews,
  Copilot/code inline comments, GraphQL review threads, or babysitting PR comments.
---

# PR comments: sequential review workflow

Walk the **current** PR’s feedback in **order**, one **topic** at a time. Treat each **comment** as something to read and answer; treat each **underlying issue** as something to fix **once**. If several comments say the same thing (or the first fix already covers a later remark), **do not** redo the same code work—use **one commit** for that shared fix and **reply on each** later comment pointing at that commit (e.g. “Addressed in `<sha>` — same fix as …”).

**CLI rule:** Use **`gh pr`** for issue-level context and **`gh pr comment`** for timeline replies. **`gh pr` cannot list inline (line-scoped) review comments**—you **must** use **`gh api`** for those. Use **`gh api`** for **threaded replies** and (optionally) **resolve** threads. Do **not** use **`gh pr view --web`** unless the user explicitly asks.

## Prerequisites

- `gh` authenticated (`gh auth status`).
- A PR for the checked-out branch (`gh pr view` without a number targets it).
- Follow repo rules for **git write**: do not commit or push unless authorized for this session.

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

**Conclusion:** after the usual `gh pr view` pass, you are **still blind** to inline comments until you run **`gh api`** below.

### 2.2 **Mandatory:** inline review comments (`gh api` — pick one strategy)

You **must** fetch inline comments every time. Use **at least one** of:

**A — GraphQL (recommended):** one request gets **threads** (`id`, `isResolved`), **grouping**, and all **inline comments** with **path / line / body / author**. Best for resolving threads later and matching how the UI groups replies.

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

**B — REST (simpler list):** flat list of every inline comment; you still **must** run this if you skip GraphQL.

```bash
gh api "repos/{owner}/{repo}/pulls/PR_NUMBER/comments" --paginate
```

Each item includes `id`, `body`, `path`, `line`, `in_reply_to_id`, `created_at`, `html_url`, etc. **No thread group or `isResolved`**—use GraphQL **A** if you need those.

### 2.3 Issue-level and summary context (still useful)

Keep using `gh pr` for what it **does** cover:

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

Use **`gh pr view`**, **`gh api`** inline payload, and **`gh pr diff`** as needed. Do not rely on the browser unless the user asks.

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

**Timeline / issue comment** (not an inline thread):

```bash
gh pr comment [<PR_NUMBER>] --body '...'
```

**Inline review comment — stay in the same thread** (`gh pr comment` **does not** attach under the line):

```bash
gh api -X POST "repos/{owner}/{repo}/pulls/comments/<COMMENT_ID>/replies" -f body='...'
```

`<COMMENT_ID>` is the REST **`id`** / GraphQL **`databaseId`** of the comment you answer (from **§2.2**).

**Optional formal review summary:**

```bash
gh pr review [<PR_NUMBER>] --comment -b '...'
```

Duplicate-addressed items: short replies (“Same fix as … in `<sha>`.”).

### 3.7 Resolve review threads (optional)

When appropriate (fixed, declined with closure, etc.—not open questions), resolve using **`thread.id`** from **§2.2 A**:

```bash
gh api graphql -f query='
mutation($id: ID!) {
  resolveReviewThread(input: { threadId: $id }) {
    thread { isResolved }
  }
}' -f id=<THREAD_ID>
```

If you only used REST **B**, you may lack `thread.id`; resolve in the UI or run the GraphQL query once to fetch thread ids.

## 4. Tracking progress

- Comments answered vs open.
- Which **commit SHA** fixed which cluster.

## Anti-patterns

- **Stopping after `gh pr view --comments` or `--json comments,reviews`** and believing you saw all feedback—you did **not** load inline comments.
- Mixing **unrelated** fixes into one commit.
- Silent pushes with no reply (**timeline** and/or **`.../replies`**).
- Using **`gh pr comment`** for feedback that belongs in an **inline thread**.
- Resolving threads that are still active debate.

**Not** an anti-pattern: **one commit** for several comments that share the **same** issue; reply on each item with pointers to that commit.

## Related

- Creating issues from gaps: [gh-issue](../gh-issue/SKILL.md).
