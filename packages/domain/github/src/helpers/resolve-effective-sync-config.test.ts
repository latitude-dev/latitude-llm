import { generateId, OrganizationId, ProjectId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { DEFAULT_GITHUB_MONITOR_SETTINGS, type GithubSyncConfigRow } from "../entities/github-sync-config.ts"
import { resolveEffectiveSyncConfig } from "./resolve-effective-sync-config.ts"

const ORG = OrganizationId(generateId())
const PROJECT = ProjectId(generateId())
const INTEGRATION = generateId()

const orgDefault = (overrides: Partial<GithubSyncConfigRow> = {}): GithubSyncConfigRow => ({
  id: generateId(),
  organizationId: ORG,
  projectId: null,
  integrationId: INTEGRATION,
  repoId: null,
  repoFullName: null,
  branch: null,
  enabled: true,
  monitorPullRequests: true,
  monitorCommits: true,
  sources: { commitMessage: true, branchName: true, prTitle: true, prBody: true },
  rules: DEFAULT_GITHUB_MONITOR_SETTINGS.rules,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const repoRow = (overrides: Partial<GithubSyncConfigRow> = {}): GithubSyncConfigRow => ({
  id: generateId(),
  organizationId: ORG,
  projectId: PROJECT,
  integrationId: INTEGRATION,
  repoId: 123,
  repoFullName: "acme/api",
  branch: "main",
  enabled: true,
  monitorPullRequests: null,
  monitorCommits: null,
  sources: null,
  rules: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe("resolveEffectiveSyncConfig", () => {
  it("inherits every null behavior field from the org default", () => {
    const effective = resolveEffectiveSyncConfig({ repoConfig: repoRow(), orgDefault: orgDefault() })
    expect(effective).not.toBeNull()
    expect(effective?.monitorPullRequests).toBe(true)
    expect(effective?.monitorCommits).toBe(true)
    expect(effective?.sources).toEqual({ commitMessage: true, branchName: true, prTitle: true, prBody: true })
    expect(effective?.rules).toEqual(DEFAULT_GITHUB_MONITOR_SETTINGS.rules)
    expect(effective?.repoId).toBe(123)
    expect(effective?.branch).toBe("main")
    expect(effective?.projectId).toBe(PROJECT)
  })

  it("replaces only the set fields, inheriting the rest", () => {
    const effective = resolveEffectiveSyncConfig({
      repoConfig: repoRow({ monitorCommits: false }),
      orgDefault: orgDefault(),
    })
    expect(effective?.monitorCommits).toBe(false)
    expect(effective?.monitorPullRequests).toBe(true)
  })

  it("replaces rules wholesale when set (no deep merge)", () => {
    const customRules = { resolveKeywords: ["ship"], unresolveKeywords: [], referenceKeywords: [] }
    const effective = resolveEffectiveSyncConfig({
      repoConfig: repoRow({ rules: customRules }),
      orgDefault: orgDefault(),
    })
    expect(effective?.rules).toEqual(customRules)
  })

  it("replaces source toggles wholesale when set", () => {
    const onlyCommits = { commitMessage: true, branchName: false, prTitle: false, prBody: false }
    const effective = resolveEffectiveSyncConfig({
      repoConfig: repoRow({ sources: onlyCommits }),
      orgDefault: orgDefault(),
    })
    expect(effective?.sources).toEqual(onlyCommits)
  })

  it("falls back to the built-in defaults when the org default is missing", () => {
    const effective = resolveEffectiveSyncConfig({ repoConfig: repoRow(), orgDefault: null })
    expect(effective?.monitorPullRequests).toBe(DEFAULT_GITHUB_MONITOR_SETTINGS.monitorPullRequests)
    expect(effective?.rules).toEqual(DEFAULT_GITHUB_MONITOR_SETTINGS.rules)
  })

  it("carries the repo row's identity and enabled fields", () => {
    const effective = resolveEffectiveSyncConfig({
      repoConfig: repoRow({ enabled: false, repoFullName: "acme/web", branch: "release" }),
      orgDefault: orgDefault(),
    })
    expect(effective?.enabled).toBe(false)
    expect(effective?.repoFullName).toBe("acme/web")
    expect(effective?.branch).toBe("release")
  })

  it("returns null when the row is not a complete repo binding", () => {
    expect(resolveEffectiveSyncConfig({ repoConfig: repoRow({ repoId: null }), orgDefault: orgDefault() })).toBeNull()
    expect(resolveEffectiveSyncConfig({ repoConfig: repoRow({ branch: null }), orgDefault: orgDefault() })).toBeNull()
    expect(resolveEffectiveSyncConfig({ repoConfig: orgDefault(), orgDefault: orgDefault() })).toBeNull()
  })
})
