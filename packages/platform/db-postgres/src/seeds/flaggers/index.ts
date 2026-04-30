import { provisionFlaggersUseCase } from "@domain/flaggers"
import { OrganizationId, ProjectId } from "@domain/shared"
import { SEED_LATITUDE_TELEMETRY_PROJECT_ID, SEED_ORG_ID } from "@domain/shared/seeding"
import { Effect } from "effect"
import { FlaggerRepositoryLive } from "../../repositories/flagger-repository.ts"
import { withPostgres } from "../../with-postgres.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

/**
 * Per-scope flagger seeder. Provisions one flagger per registered strategy
 * slug for the project the seed scope points at. Used by both `pnpm seed`
 * (bootstrap scope → seeds the canonical seed project) and the runtime
 * "Create Demo Project" workflow (demo scope → seeds the new demo project).
 */
const seedScopeFlaggers: Seeder = {
  name: "flaggers/seed-project-flaggers",
  run: (ctx: SeedContext) =>
    Effect.gen(function* () {
      const rows = yield* provisionFlaggersUseCase({
        organizationId: ctx.scope.organizationId,
        projectId: ctx.scope.projectId,
      })
      console.log(`  -> flaggers: ${rows.length} provisioned`)
    }).pipe(
      withPostgres(FlaggerRepositoryLive, ctx.client, ctx.scope.organizationId),
      Effect.mapError((cause) => new SeedError({ reason: "Failed to seed flaggers", cause })),
    ),
}

/**
 * Bootstrap-only: also provision flaggers for the dogfood telemetry
 * project, which receives LLM telemetry from Latitude's own system
 * annotator + product-feedback annotations. Lives outside `contentSeeders`
 * so the demo workflow doesn't try to provision flaggers on a project on
 * a different org.
 */
const seedTelemetryProjectFlaggers: Seeder = {
  name: "flaggers/seed-telemetry-project-flaggers",
  run: (ctx: SeedContext) =>
    Effect.gen(function* () {
      const rows = yield* provisionFlaggersUseCase({
        organizationId: SEED_ORG_ID,
        projectId: ProjectId(SEED_LATITUDE_TELEMETRY_PROJECT_ID),
      })
      console.log(`  -> flaggers (telemetry project): ${rows.length} provisioned`)
    }).pipe(
      withPostgres(FlaggerRepositoryLive, ctx.client, OrganizationId(SEED_ORG_ID)),
      Effect.mapError((cause) => new SeedError({ reason: "Failed to seed telemetry project flaggers", cause })),
    ),
}

export const flaggerSeeders: readonly Seeder[] = [seedScopeFlaggers]
export const bootstrapTelemetryFlaggerSeeders: readonly Seeder[] = [seedTelemetryProjectFlaggers]
