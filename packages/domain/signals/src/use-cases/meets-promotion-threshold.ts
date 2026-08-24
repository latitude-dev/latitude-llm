import { ScoreRepository } from "@domain/scores"
import {
  type CacheError,
  type CacheStore,
  type ChSqlClient,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  SignalId,
} from "@domain/shared"
import type { SessionRepository } from "@domain/spans"
import { Effect } from "effect"
import { PROMOTION_WINDOW_DAYS } from "../constants.ts"
import { promotionThresholdForVolume } from "../promotion.ts"
import { resolveProjectSessionVolumeUseCase } from "./resolve-project-session-volume.ts"

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

interface MeetsPromotionThresholdInput {
  readonly organizationId: string
  readonly projectId: string
  readonly signalId: string
  readonly asOf?: Date
}

type MeetsPromotionThresholdResult = {
  readonly meets: boolean
  readonly sessions: number
  readonly threshold: number
}

export const meetsPromotionThresholdUseCase = (input: MeetsPromotionThresholdInput) =>
  Effect.gen(function* () {
    const asOf = input.asOf ?? new Date()
    const volume = yield* resolveProjectSessionVolumeUseCase({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      now: asOf,
    })
    const threshold = promotionThresholdForVolume(volume)
    const scoreRepository = yield* ScoreRepository
    const sessions = yield* scoreRepository.countDistinctSessionsBySignalId({
      projectId: ProjectId(input.projectId),
      signalId: SignalId(input.signalId),
      since: new Date(asOf.getTime() - PROMOTION_WINDOW_DAYS * MILLISECONDS_PER_DAY),
    })

    yield* Effect.annotateCurrentSpan("promotion.sessions", sessions)
    yield* Effect.annotateCurrentSpan("promotion.threshold", threshold)
    yield* Effect.annotateCurrentSpan("promotion.volume", volume ?? -1)
    yield* Effect.annotateCurrentSpan("promotion.volumeDegraded", volume === null)
    yield* Effect.annotateCurrentSpan("promotion.qualified", sessions >= threshold)

    return { meets: sessions >= threshold, sessions, threshold } satisfies MeetsPromotionThresholdResult
  }).pipe(Effect.withSpan("issues.meetsPromotionThreshold")) as Effect.Effect<
    MeetsPromotionThresholdResult,
    RepositoryError | CacheError,
    CacheStore | ChSqlClient | SessionRepository
  >
