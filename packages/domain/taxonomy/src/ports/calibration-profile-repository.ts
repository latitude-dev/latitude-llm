import type { ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { CalibrationProfile, CalibrationScope } from "../entities/calibration.ts"

export interface CalibrationProfileRepositoryShape {
  findByProject(input: {
    readonly projectId: ProjectId
    readonly scope: CalibrationScope
  }): Effect.Effect<CalibrationProfile | null, RepositoryError, SqlClient>
  /** Upserts on (organizationId, projectId, scope). */
  save(profile: CalibrationProfile): Effect.Effect<void, RepositoryError, SqlClient>
}

export class CalibrationProfileRepository extends Context.Service<
  CalibrationProfileRepository,
  CalibrationProfileRepositoryShape
>()("@domain/taxonomy/CalibrationProfileRepository") {}
