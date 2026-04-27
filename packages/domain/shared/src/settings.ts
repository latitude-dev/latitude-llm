import { Effect, ServiceMap } from "effect"
import { z } from "zod"
import type { RepositoryError } from "./errors.ts"
import type { ProjectId } from "./id.ts"
import type { SqlClient } from "./sql-client.ts"

export const organizationSettingsSchema = z.object({
  keepMonitoring: z.boolean().optional(), // TODO: deprecated. Removed from frontend but maintained to keep cascaded settings scaffold
})

export const projectSettingsSchema = z.object({
  keepMonitoring: z.boolean().optional(),
})

export type OrganizationSettings = z.infer<typeof organizationSettingsSchema>

export type ProjectSettings = z.infer<typeof projectSettingsSchema>

export type ResolvedSettings = {
  readonly keepMonitoring: boolean
}

const SYSTEM_DEFAULTS: ResolvedSettings = {
  keepMonitoring: true,
}

export function resolveSettingsCascade(input: {
  organization: OrganizationSettings | null
  project?: ProjectSettings | null
}): ResolvedSettings {
  const org = input.organization ?? {}
  const proj = input.project ?? {}

  return {
    keepMonitoring: proj.keepMonitoring ?? org.keepMonitoring ?? SYSTEM_DEFAULTS.keepMonitoring,
  }
}

// Future: evaluationId can be added here
export class SettingsReader extends ServiceMap.Service<
  SettingsReader,
  {
    getOrganizationSettings: () => Effect.Effect<OrganizationSettings | null, RepositoryError, SqlClient>
    getProjectSettings: (projectId: ProjectId) => Effect.Effect<ProjectSettings | null, RepositoryError, SqlClient>
  }
>()("@domain/shared/SettingsReader") {}

export const resolveSettings = (input?: { projectId?: ProjectId }) =>
  Effect.gen(function* () {
    const reader = yield* SettingsReader
    const orgSettings = yield* reader.getOrganizationSettings()

    let projectSettings: ProjectSettings | null = null
    if (input?.projectId) {
      projectSettings = yield* reader.getProjectSettings(input.projectId)
    }

    return resolveSettingsCascade({ organization: orgSettings, project: projectSettings })
  })
