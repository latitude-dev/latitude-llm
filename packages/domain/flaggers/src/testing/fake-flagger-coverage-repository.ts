import { Effect } from "effect"
import type { FlaggerCoverageRepositoryShape } from "../ports/flagger-coverage-repository.ts"

export const createFakeFlaggerCoverageRepository = (
  overrides: Partial<FlaggerCoverageRepositoryShape> = {},
): FlaggerCoverageRepositoryShape => ({
  getProjectCoverage: (input) =>
    Effect.succeed({
      organizationId: input.organizationId,
      projectId: input.projectId,
      from: input.from,
      to: input.to,
      eligibleSessions: 0,
      rows: [],
    }),
  ...overrides,
})
