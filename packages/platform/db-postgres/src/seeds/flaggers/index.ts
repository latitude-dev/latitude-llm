import { provisionFlaggersUseCase } from "@domain/flaggers"
import { OrganizationId, ProjectId } from "@domain/shared"
import { SEED_LATITUDE_TELEMETRY_PROJECT_ID, SEED_ORG_ID, SEED_PROJECT_ID } from "@domain/shared/seeding"
import { Effect } from "effect"
import { FlaggerRepositoryLive } from "../../repositories/flagger-repository.ts"
import { withPostgres } from "../../with-postgres.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

const projectIds = [SEED_PROJECT_ID, SEED_LATITUDE_TELEMETRY_PROJECT_ID] as const

const seedFlaggers: Seeder = {
  name: "flaggers/seed-project-flaggers",
  run: (ctx: SeedContext) => {
    return Effect.gen(function* () {
      let totalProvisioned = 0
      for (const projectId of projectIds) {
        const rows = yield* provisionFlaggersUseCase({
          organizationId: SEED_ORG_ID,
          projectId: ProjectId(projectId),
        })
        totalProvisioned += rows.length
      }
      console.log(`  -> flaggers: ${totalProvisioned} provisioned`)
    }).pipe(
      withPostgres(FlaggerRepositoryLive, ctx.client, OrganizationId(SEED_ORG_ID)),
      Effect.mapError((cause) => new SeedError({ reason: "Failed to seed flaggers", cause })),
    )
  },
}

export const flaggerSeeders: readonly Seeder[] = [seedFlaggers]
