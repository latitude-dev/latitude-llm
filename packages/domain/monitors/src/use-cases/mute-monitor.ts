import { type MonitorId, type NotFoundError, type RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { Monitor } from "../entities/monitor.ts"
import { MonitorRepository } from "../ports/monitor-repository.ts"

export interface SetMonitorMuteInput {
  readonly id: MonitorId
}

export type SetMonitorMuteError = NotFoundError | RepositoryError

// Mute/unmute are allowed on both system and user monitors — muting a monitor
// is the per-monitor replacement for the legacy per-kind notification toggles.
const setMute = (
  id: MonitorId,
  muted: boolean,
): Effect.Effect<Monitor, SetMonitorMuteError, SqlClient | MonitorRepository> =>
  Effect.gen(function* () {
    const sqlClient = yield* SqlClient
    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const repository = yield* MonitorRepository
        const monitor = yield* repository.findById(id)
        const now = new Date()
        const mutedAt = muted ? now : null
        yield* repository.setMuted({ id, mutedAt })
        return { ...monitor, mutedAt, updatedAt: now }
      }),
    )
  })

export const muteMonitorUseCase = (input: SetMonitorMuteInput) => setMute(input.id, true)
export const unmuteMonitorUseCase = (input: SetMonitorMuteInput) => setMute(input.id, false)
