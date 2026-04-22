---
name: review-pr-comments
description: >-
    Uses gh pr to inspect a PR and gh api where needed for inline review threads, then
    walks feedback in order (read, judge, implement, commit/push, reply in the correct
    thread). Groups duplicate comments into one fix and points later threads at that
    commit. Use when triaging PR review comments sequentially, threaded replies on line
    comments, or babysit PR comments with scoped commits.
---

# PR comments: sequential review workflow

Walk the **current** PR’s feedback in **order**, one **topic** at a time. Treat each **comment** as something to read and answer; treat each **underlying issue** as something to fix **once**. If several comments say the same thing (or the first fix already covers a later remark), **do not** redo the same code work—use **one commit** for that shared fix and **reply on each** later comment pointing at that commit (e.g. “Addressed in `<sha>` — same fix as …”).

**CLI rule:** Prefer **`gh pr`** for viewing and for **top-level** PR conversation replies. Use **`gh api`** when you must interact with **inline review comments** (list them by id, **reply in the same thread**, or **resolve** a review thread)—those are not fully covered by `gh pr` alone. Do **not** use **`gh pr view --web`** or open the PR in a browser for this workflow unless the user explicitly asks.

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

## 2. Load all review artifacts

Build an ordered work list before changing code. You need **numeric ids** for inline comments if you will **thread-reply** to them.

**Rendered overview (human-readable):**

```bash
gh pr view [<PR_NUMBER>] --comments
```

**Timeline / issue-style comments (JSON):**

```bash
gh pr view [<PR_NUMBER>] --json comments,reviews,latestReviews
```

**Inline review comments (diff threads)** — includes `id`, `body`, `path`, `line`, `in_reply_to_id`, `html_url`; required for **same-thread** replies:

```bash
gh api "repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments" --paginate
```

(`{owner}` and `{repo}` are filled by `gh` from the current repo.)

Merge these into one picture: who said what, when, and on which files (use **`gh pr diff [<PR_NUMBER>]`** if you need the patch for context).

Sort work **chronologically** (oldest first) unless the user specifies otherwise.

**Duplication:** While ordering by time, **cluster** comments that ask for the same change (same file/behavior, or explicitly the same nit). You will **implement once** and **reply to each** comment in that cluster.

## 3. Process comments in order (one pass, dedupe fixes)

For **each** comment in chronological order:

### 3.1 Read

Use **`gh pr view`** output, **`gh api`** pull-comment payloads, and **`gh pr diff`** as needed. Do not rely on the browser unless the user asks.

### 3.2 Interpret

Classify: change request, question, nit, or discussion. Note which files/behavior it touches.

### 3.3 Judge

Decide if it is right, unclear, or you disagree. Skip or discuss without code when appropriate.

### 3.4 Implement (when needed)

If this comment’s **underlying issue** is **already fixed** by a commit you made for an **earlier** comment in this run, **do not edit the code again**—go to **3.6** and reply that it is covered (see below).

Otherwise, if code or config should change, apply **only** that scoped fix. If multiple **concurrent** comments in the same cluster all require the **same** edit, make **one** edit and **one** commit for that cluster.

### 3.5 Commit and push

- **Single distinct issue** (possibly mentioned by several comments): **one commit** that fixes it; push when you are ready to expose that fix.
- **Separate issues:** separate commits—do not mix unrelated changes into one commit.
- Reference the PR or review in the message if the repo uses that convention.

After pushing, capture the **commit SHA** (e.g. `git rev-parse HEAD`) to cite in replies.

### 3.6 Reply in the right place

Every comment that expects a response should get one.

**A) Issue / main conversation** (general PR discussion, not a threaded inline reply. Avoid using this if an inline reply is possible):

```bash
gh pr comment [<PR_NUMBER>] --body '...'
```

**B) Inline review comment — reply in the same conversation thread** (this requires `gh api`; `gh pr comment` does **not** attach under the line comment):

```bash
gh api -X POST "repos/{owner}/{repo}/pulls/comments/<COMMENT_ID>/replies" -f body='...'
```

Use the **`id`** of the **comment you are answering** from:

`gh api "repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments" --paginate`

(For a thread with multiple messages, reply to the **specific** comment you are addressing—usually the latest in that thread or the root, per GitHub’s threading rules.)

**C) Optional formal review summary:**

```bash
gh pr review [<PR_NUMBER>] --comment -b '...'
```

For **follow-up** comments that duplicate an already-addressed point, a short reply is enough, for example:

- “Same as above — fixed in `<sha>` (`<first line of message>`).”
- “Covered by the change in `<sha>` for the earlier note on `<file>`.”

Use **B** when the feedback is on a **line/diff thread** so the reply stays **in that thread**; use **A** for top-level timeline comments.

### 3.7 Resolve review threads (optional)

GitHub exposes **resolve** via GraphQL, not `gh pr`. When a thread is truly done (see judgment in the previous version of this skill: fixed, reminder done, or declined with no further action **on that point**), you may resolve with:

```bash
gh api graphql -f query='
mutation($id: ID!) {
  resolveReviewThread(input: { threadId: $id }) {
    thread { isResolved }
  }
}' -f id=<THREAD_ID>
```

Obtain `THREAD_ID` with a GraphQL query on `pullRequest(... ) { reviewThreads(...) { nodes { id ... } } }`, or resolve in the GitHub UI if IDs are cumbersome. **Do not** resolve when the exchange is still a question, an open debate, or “we did not implement this” where the reviewer may respond.

If you skip GraphQL, a clear **`gh pr comment`** or threaded **`replies`** post is enough for humans to resolve in the UI.

## 4. Tracking progress

Keep a lightweight map for yourself:

- Comments answered vs still open.
- Which commit SHA fixed which cluster of comments.

## Anti-patterns

- Mixing **unrelated** fixes into a single commit to move faster.
- Silent pushes with no reply on the relevant notes (`gh pr comment` and/or **`gh api`…`/replies`**).
- Using only **`gh pr comment`** for **inline** feedback when a **threaded** reply was required—those land on the main timeline, not under the review comment.
- Resolving every thread when the conversation is **not** actually closed (questions, ongoing debate).
- Ignoring **`gh pr view --comments`**, **`--json`**, or **`gh api pulls/.../comments`** and missing part of the review.

**Not** an anti-pattern: **one commit** that fixes **several comments** when they all target the **same** issue; use per-comment replies that point at that commit.

## Related

- Creating issues from gaps: [gh-issue](../gh-issue/SKILL.md).
