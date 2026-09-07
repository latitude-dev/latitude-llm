import type { ChSqlClient, OrganizationId, ProjectId, RepositoryError } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { FlaggerCoverageReport } from "../entities/flagger-coverage.ts"

export interface GetFlaggerCoverageInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly from: Date
  readonly to: Date
}

export interface FlaggerCoverageRepositoryShape {
  getProjectCoverage(input: GetFlaggerCoverageInput): Effect.Effect<FlaggerCoverageReport, RepositoryError, ChSqlClient>
}

export class FlaggerCoverageRepository extends Context.Service<
  FlaggerCoverageRepository,
  FlaggerCoverageRepositoryShape
>()("@domain/flaggers/FlaggerCoverageRepository") {}
