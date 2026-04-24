import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { OrganizationId, type ProjectId } from "./id.ts"
import {
  type OrganizationSettings,
  type ProjectSettings,
  resolveSettings,
  resolveSettingsCascade,
  SettingsReader,
} from "./settings.ts"
import { SqlClient } from "./sql-client.ts"

const fakeSqlClient = Layer.succeed(SqlClient, {
  organizationId: OrganizationId("system"),
  transaction: ((eff: never) => eff) as never,
  query: (() => Effect.die("SqlClient.query not implemented in settings.test.ts")) as never,
})

function fakeSettingsReader(input: {
  organization: OrganizationSettings | null
  projects?: Record<string, ProjectSettings | null>
}) {
  return Layer.succeed(SettingsReader, {
    getOrganizationSettings: () => Effect.succeed(input.organization),
    getProjectSettings: (projectId: ProjectId) => Effect.succeed(input.projects?.[projectId] ?? null),
  })
}

describe("resolveSettingsCascade", () => {
  it("returns system defaults when both layers are null", () => {
    const result = resolveSettingsCascade({ organization: null, project: null })
    expect(result).toEqual({ keepMonitoring: true })
  })

  it("returns system defaults when both layers are empty objects", () => {
    const result = resolveSettingsCascade({ organization: {}, project: {} })
    expect(result).toEqual({ keepMonitoring: true })
  })

  it("uses organization value when project is null", () => {
    const result = resolveSettingsCascade({ organization: { keepMonitoring: false }, project: null })
    expect(result).toEqual({ keepMonitoring: false })
  })

  it("uses organization value when project field is undefined", () => {
    const result = resolveSettingsCascade({ organization: { keepMonitoring: false }, project: {} })
    expect(result).toEqual({ keepMonitoring: false })
  })

  it("project overrides organization", () => {
    const result = resolveSettingsCascade({
      organization: { keepMonitoring: true },
      project: { keepMonitoring: false },
    })
    expect(result).toEqual({ keepMonitoring: false })
  })

  it("project value wins even when organization is null", () => {
    const result = resolveSettingsCascade({ organization: null, project: { keepMonitoring: false } })
    expect(result).toEqual({ keepMonitoring: false })
  })
})

describe("resolveSettings", () => {
  it("returns system defaults when org has no settings", async () => {
    const layer = fakeSettingsReader({ organization: null })
    const result = await Effect.runPromise(resolveSettings().pipe(Effect.provide(Layer.mergeAll(layer, fakeSqlClient))))
    expect(result).toEqual({ keepMonitoring: true })
  })

  it("returns org-level value when no project is provided", async () => {
    const layer = fakeSettingsReader({ organization: { keepMonitoring: false } })
    const result = await Effect.runPromise(resolveSettings().pipe(Effect.provide(Layer.mergeAll(layer, fakeSqlClient))))
    expect(result).toEqual({ keepMonitoring: false })
  })

  it("does not fetch project settings when projectId is omitted", async () => {
    let projectFetched = false
    const layer = Layer.succeed(SettingsReader, {
      getOrganizationSettings: () => Effect.succeed(null),
      getProjectSettings: () => {
        projectFetched = true
        return Effect.succeed(null)
      },
    })

    await Effect.runPromise(resolveSettings().pipe(Effect.provide(Layer.mergeAll(layer, fakeSqlClient))))
    expect(projectFetched).toBe(false)
  })

  it("merges project override over org settings", async () => {
    const layer = fakeSettingsReader({
      organization: { keepMonitoring: true },
      projects: { proj1: { keepMonitoring: false } },
    })

    const result = await Effect.runPromise(
      resolveSettings({ projectId: "proj1" as ProjectId }).pipe(Effect.provide(Layer.mergeAll(layer, fakeSqlClient))),
    )
    expect(result).toEqual({ keepMonitoring: false })
  })

  it("falls through to org when project has no settings", async () => {
    const layer = fakeSettingsReader({
      organization: { keepMonitoring: false },
      projects: { proj1: null },
    })

    const result = await Effect.runPromise(
      resolveSettings({ projectId: "proj1" as ProjectId }).pipe(Effect.provide(Layer.mergeAll(layer, fakeSqlClient))),
    )
    expect(result).toEqual({ keepMonitoring: false })
  })

  it("falls through to system default when both are empty", async () => {
    const layer = fakeSettingsReader({
      organization: {},
      projects: { proj1: {} },
    })

    const result = await Effect.runPromise(
      resolveSettings({ projectId: "proj1" as ProjectId }).pipe(Effect.provide(Layer.mergeAll(layer, fakeSqlClient))),
    )
    expect(result).toEqual({ keepMonitoring: true })
  })
})
