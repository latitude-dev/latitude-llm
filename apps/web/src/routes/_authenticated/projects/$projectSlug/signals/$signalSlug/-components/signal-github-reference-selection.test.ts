import { describe, expect, it } from "vitest"
import type { GithubSignalReferenceRecord } from "../../../../../../../domains/github/github.functions.ts"
import { selectPrimaryGithubReference, sortGithubReferencesForList } from "./signal-github-reference-selection.ts"

const ref = (
  overrides: Partial<GithubSignalReferenceRecord> & Pick<GithubSignalReferenceRecord, "id">,
): GithubSignalReferenceRecord => ({
  referenceType: "pull_request",
  repoFullName: "acme/app",
  prNumber: 1,
  prState: "open",
  commitSha: null,
  title: "title",
  url: "https://github.com/acme/app/pull/1",
  authorLogin: "octocat",
  action: "resolve",
  actionAppliedAt: null,
  mergedAt: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
})

const commit = (overrides: Partial<GithubSignalReferenceRecord> & Pick<GithubSignalReferenceRecord, "id">) =>
  ref({ referenceType: "commit", prNumber: null, prState: null, commitSha: "a".repeat(40), ...overrides })

describe("selectPrimaryGithubReference", () => {
  it("returns undefined for no references", () => {
    expect(selectPrimaryGithubReference([])).toBeUndefined()
  })

  it("prefers a PR over a more recent commit", () => {
    const pr = ref({ id: "pr", updatedAt: "2026-01-01T00:00:00.000Z" })
    const c = commit({ id: "commit", mergedAt: "2026-06-01T00:00:00.000Z" })
    expect(selectPrimaryGithubReference([c, pr])?.id).toBe("pr")
  })

  it("prefers a newly opened PR over an older merged PR (most recent event wins)", () => {
    const merged = ref({
      id: "merged",
      prState: "merged",
      mergedAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    })
    const open = ref({
      id: "open",
      prNumber: 2,
      prState: "open",
      updatedAt: "2026-06-01T00:00:00.000Z",
      createdAt: "2026-06-01T00:00:00.000Z",
    })
    expect(selectPrimaryGithubReference([merged, open])?.id).toBe("open")
  })

  it("among merged PRs picks the most recently merged", () => {
    const older = ref({
      id: "older",
      prState: "merged",
      mergedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    })
    const newer = ref({
      id: "newer",
      prNumber: 2,
      prState: "merged",
      mergedAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    })
    expect(selectPrimaryGithubReference([older, newer])?.id).toBe("newer")
  })

  it("with no merged PR picks the most recently updated PR", () => {
    const a = ref({ id: "a", prState: "closed", updatedAt: "2026-02-01T00:00:00.000Z" })
    const b = ref({ id: "b", prNumber: 2, prState: "open", updatedAt: "2026-04-01T00:00:00.000Z" })
    expect(selectPrimaryGithubReference([a, b])?.id).toBe("b")
  })

  it("among commits only, picks the most recent", () => {
    const older = commit({ id: "older", commitSha: "b".repeat(40), mergedAt: "2026-01-01T00:00:00.000Z" })
    const newer = commit({ id: "newer", commitSha: "c".repeat(40), mergedAt: "2026-05-01T00:00:00.000Z" })
    expect(selectPrimaryGithubReference([older, newer])?.id).toBe("newer")
  })
})

describe("sortGithubReferencesForList", () => {
  it("orders PRs (recency desc) before commits (recency desc)", () => {
    const prOld = ref({ id: "prOld", prState: "merged", mergedAt: "2026-01-01T00:00:00.000Z" })
    const prNew = ref({ id: "prNew", prNumber: 2, prState: "merged", mergedAt: "2026-05-01T00:00:00.000Z" })
    const commitOld = commit({ id: "commitOld", commitSha: "b".repeat(40), mergedAt: "2026-02-01T00:00:00.000Z" })
    const commitNew = commit({ id: "commitNew", commitSha: "c".repeat(40), mergedAt: "2026-06-01T00:00:00.000Z" })
    const sorted = sortGithubReferencesForList([commitOld, prOld, commitNew, prNew])
    expect(sorted.map((r) => r.id)).toEqual(["prNew", "prOld", "commitNew", "commitOld"])
  })
})
