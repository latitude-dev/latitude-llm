import { SqlClient, type SqlClientShape } from "@domain/shared"
import { type CalibrationProfile, CalibrationProfileRepository, calibrationProfileSchema } from "@domain/taxonomy"
import { and, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { calibrationProfiles } from "../schema/calibration-profiles.ts"

const toDomainProfile = (row: typeof calibrationProfiles.$inferSelect): CalibrationProfile =>
  calibrationProfileSchema.parse({
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    scope: row.scope,
    payload: row.payload,
    metrics: row.metrics,
    sampleSize: row.sampleSize,
    computedAt: row.computedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

const toInsertRow = (profile: CalibrationProfile): typeof calibrationProfiles.$inferInsert => ({
  id: profile.id,
  organizationId: profile.organizationId,
  projectId: profile.projectId,
  scope: profile.scope,
  payload: profile.payload,
  metrics: profile.metrics,
  sampleSize: profile.sampleSize,
  computedAt: profile.computedAt,
  createdAt: profile.createdAt,
  updatedAt: profile.updatedAt,
})

export const CalibrationProfileRepositoryLive = Layer.effect(
  CalibrationProfileRepository,
  Effect.gen(function* () {
    return {
      findByProject: ({ projectId, scope }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db, organizationId) =>
            db
              .select()
              .from(calibrationProfiles)
              .where(
                and(
                  eq(calibrationProfiles.organizationId, organizationId),
                  eq(calibrationProfiles.projectId, projectId),
                  eq(calibrationProfiles.scope, scope),
                ),
              )
              .limit(1),
          )
          return rows[0] ? toDomainProfile(rows[0]) : null
        }),

      save: (profile) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db) =>
            db
              .insert(calibrationProfiles)
              .values(toInsertRow(profile))
              .onConflictDoUpdate({
                target: [calibrationProfiles.organizationId, calibrationProfiles.projectId, calibrationProfiles.scope],
                set: {
                  payload: profile.payload,
                  metrics: profile.metrics,
                  sampleSize: profile.sampleSize,
                  computedAt: profile.computedAt,
                  updatedAt: profile.updatedAt,
                },
              }),
          )
        }),
    }
  }),
)
