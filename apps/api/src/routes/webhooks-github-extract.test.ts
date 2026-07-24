import { describe, expect, it } from "vitest"
import { PUSH_COMMIT_CAP, routeGithubWebhook } from "./webhooks-github-extract.ts"

const DELIVERY = "d-1"

describe("routeGithubWebhook", () => {
  it("routes ping to a no-enqueue ack", () => {
    expect(routeGithubWebhook({ event: "ping", deliveryId: DELIVERY, body: {} })).toEqual({ kind: "ping" })
  })

  it("ignores unmonitored events", () => {
    expect(routeGithubWebhook({ event: "star", deliveryId: DELIVERY, body: {} })).toEqual({ kind: "ignore" })
  })

  it("ignores unmonitored pull_request actions", () => {
    const route = routeGithubWebhook({ event: "pull_request", deliveryId: DELIVERY, body: { action: "labeled" } })
    expect(route.kind).toBe("ignore")
  })

  it("slim-extracts an opened pull_request", () => {
    const route = routeGithubWebhook({
      event: "pull_request",
      deliveryId: DELIVERY,
      body: {
        action: "opened",
        installation: { id: 42 },
        repository: { id: 100, full_name: "acme/app" },
        pull_request: {
          number: 7,
          title: "Resolves LAT-AB12: fix timeouts",
          body: "Resolves LAT-AB12",
          state: "open",
          draft: false,
          merged: false,
          merge_commit_sha: null,
          merged_at: null,
          html_url: "https://github.com/acme/app/pull/7",
          author_association: "MEMBER",
          user: { login: "octocat" },
          head: { ref: "fix/lat-ab12-timeouts", sha: "headsha", repo: { id: 100 } },
          base: { ref: "main" },
        },
      },
    })
    expect(route.kind).toBe("pull-request")
    if (route.kind !== "pull-request") return
    expect(route.task).toMatchObject({
      deliveryId: DELIVERY,
      installationId: 42,
      repoId: 100,
      repoFullName: "acme/app",
      action: "opened",
      prNumber: 7,
      title: "Resolves LAT-AB12: fix timeouts",
      body: "Resolves LAT-AB12",
      state: "open",
      draft: false,
      merged: false,
      headRef: "fix/lat-ab12-timeouts",
      headSha: "headsha",
      headRepoId: 100,
      baseRef: "main",
      userLogin: "octocat",
      authorAssociation: "MEMBER",
      changesBaseRef: null,
    })
  })

  it("captures a merged pull_request's merge keys and a retarget's previous base", () => {
    const route = routeGithubWebhook({
      event: "pull_request",
      deliveryId: DELIVERY,
      body: {
        action: "edited",
        installation: { id: 42 },
        repository: { id: 100, full_name: "acme/app" },
        changes: { base: { ref: { from: "develop" } } },
        pull_request: {
          number: 7,
          merged: true,
          merge_commit_sha: "mergesha",
          merged_at: "2026-07-23T00:00:00Z",
          state: "closed",
          head: { ref: "feature", sha: "hsha", repo: { id: 999 } },
          base: { ref: "main" },
        },
      },
    })
    expect(route.kind).toBe("pull-request")
    if (route.kind !== "pull-request") return
    expect(route.task.merged).toBe(true)
    expect(route.task.mergeCommitSha).toBe("mergesha")
    expect(route.task.headRepoId).toBe(999)
    expect(route.task.changesBaseRef).toBe("develop")
  })

  it("slim-extracts a push and its commit messages", () => {
    const route = routeGithubWebhook({
      event: "push",
      deliveryId: DELIVERY,
      body: {
        installation: { id: 42 },
        repository: { id: 100, full_name: "acme/app", default_branch: "main" },
        ref: "refs/heads/main",
        before: "b0",
        after: "a1",
        created: false,
        deleted: false,
        forced: false,
        commits: [{ id: "c1", message: "Fixes LAT-AB12", timestamp: "t", author: { username: "octocat" }, url: "u1" }],
      },
    })
    expect(route.kind).toBe("push")
    if (route.kind !== "push") return
    expect(route.task.ref).toBe("refs/heads/main")
    expect(route.task.after).toBe("a1")
    expect(route.task.commits).toHaveLength(1)
    expect(route.task.commits[0]).toMatchObject({ id: "c1", message: "Fixes LAT-AB12", authorUsername: "octocat" })
    expect(route.task.truncated).toBe(false)
  })

  it("caps commits per push and flags truncation", () => {
    const commits = Array.from({ length: PUSH_COMMIT_CAP + 5 }, (_, i) => ({
      id: `c${i}`,
      message: `m${i}`,
      timestamp: "t",
      author: { username: "octocat" },
      url: `u${i}`,
    }))
    const route = routeGithubWebhook({
      event: "push",
      deliveryId: DELIVERY,
      body: { installation: { id: 1 }, repository: { id: 1, full_name: "a/b" }, ref: "refs/heads/main", commits },
    })
    expect(route.kind).toBe("push")
    if (route.kind !== "push") return
    expect(route.task.commits).toHaveLength(PUSH_COMMIT_CAP)
    expect(route.task.truncated).toBe(true)
  })

  it("routes installation and installation_repositories to the installation task", () => {
    const installation = routeGithubWebhook({
      event: "installation",
      deliveryId: DELIVERY,
      body: {
        action: "deleted",
        installation: { id: 42, account: { login: "acme", type: "Organization" }, repository_selection: "all" },
      },
    })
    expect(installation.kind).toBe("installation")
    if (installation.kind !== "installation") return
    expect(installation.task).toMatchObject({
      installationId: 42,
      event: "installation",
      action: "deleted",
      accountLogin: "acme",
      accountType: "Organization",
      repositorySelection: "all",
    })

    const repos = routeGithubWebhook({
      event: "installation_repositories",
      deliveryId: DELIVERY,
      body: {
        action: "removed",
        installation: { id: 42, account: { login: "acme", type: "Organization" }, repository_selection: "selected" },
      },
    })
    expect(repos.kind).toBe("installation")
    if (repos.kind !== "installation") return
    expect(repos.task.event).toBe("installation_repositories")
    expect(repos.task.repositorySelection).toBe("selected")
  })
})
