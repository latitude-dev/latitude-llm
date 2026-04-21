import { type ProjectId, SettingsReader, SqlClient, type SqlClientShape } from "@domain/shared"
import { and, eq, isNull } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { organizations } from "../schema/better-auth.ts"
import { projects } from "../schema/projects.ts"

export const SettingsReaderLive = Layer.effect(
  SettingsReader,
  Effect.gen(function* () {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

    return {
      getOrganizationSettings: () =>
        sqlClient
          .query((db) =>
            db
              .select({ settings: organizations.settings })
              .from(organizations)
              .where(eq(organizations.id, sqlClient.organizationId))
              .limit(1),
          )
          .pipe(Effect.map((results) => results[0]?.settings ?? null)),

      getProjectSettings: (projectId: ProjectId) =>
        sqlClient
          .query((db) =>
            db
              .select({ settings: projects.settings })
              .from(projects)
              .where(
                and(
                  eq(projects.organizationId, sqlClient.organizationId),
                  eq(projects.id, projectId),
                  isNull(projects.deletedAt),
                ),
              )
              .limit(1),
          )
          .pipe(Effect.map((results) => results[0]?.settings ?? null)),
    }
  }),
)
