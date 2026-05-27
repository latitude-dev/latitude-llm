import { Effect } from "effect"
import type { CalibrationProfile } from "../entities/calibration.ts"
import type { CalibrationProfileRepositoryShape } from "../ports/calibration-profile-repository.ts"

export const createFakeCalibrationProfileRepository = (initial: readonly CalibrationProfile[] = []) => {
  const rows = new Map<string, CalibrationProfile>()
  for (const profile of initial) {
    rows.set(`${profile.organizationId}:${profile.projectId}:${profile.scope}`, profile)
  }

  const repository: CalibrationProfileRepositoryShape = {
    findByProject: ({ projectId, scope }) =>
      Effect.sync(
        () => [...rows.values()].find((profile) => profile.projectId === projectId && profile.scope === scope) ?? null,
      ),
    save: (profile) =>
      Effect.sync(() => {
        rows.set(`${profile.organizationId}:${profile.projectId}:${profile.scope}`, profile)
      }),
  }

  return { repository, rows }
}
