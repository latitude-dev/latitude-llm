import {
  deterministicSampling,
  type FilterSet,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  TraceId,
} from "@domain/shared"
import { type CryptoError, hash } from "@repo/utils"
import { Effect } from "effect"
import { TraceRepository } from "../ports/trace-repository.ts"

export interface TraceEndSelectionSpec {
  readonly sampling: number
  readonly filter?: FilterSet
  readonly sampleKey?: string
}

export interface TraceEndSelectionInput {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly items: Readonly<Record<string, TraceEndSelectionSpec>>
}

export type TraceEndSelectionReason = "selected" | "sampled-out" | "filter-miss"

export interface TraceEndSelectionDecision {
  readonly selected: boolean
  readonly reason: TraceEndSelectionReason
}

export type TraceEndSelectionResult = Readonly<Record<string, TraceEndSelectionDecision>>

export type SelectTraceEndItemsError = RepositoryError | CryptoError

interface FilterBatchEntry {
  readonly fingerprint: string
  readonly filter: FilterSet
  readonly itemKeys: readonly string[]
}

const selectedDecision = (): TraceEndSelectionDecision => ({
  selected: true,
  reason: "selected",
})

const skippedDecision = (reason: Exclude<TraceEndSelectionReason, "selected">): TraceEndSelectionDecision => ({
  selected: false,
  reason,
})

const normalizeFilterSet = (filter?: FilterSet): FilterSet | undefined => {
  if (!filter) return undefined

  const pruned = Object.fromEntries(
    Object.entries(filter).filter(([, conditions]) => Array.isArray(conditions) && conditions.length > 0),
  ) as FilterSet

  if (Object.keys(pruned).length === 0) {
    return undefined
  }

  return pruned
}

const buildFingerprint = (filter: FilterSet) => hash(filter).pipe(Effect.map((digest) => `filter:${digest}`))

const buildFilterBatch = (entries: readonly [string, TraceEndSelectionSpec][]) =>
  Effect.gen(function* () {
    const fingerprints = new Map<string, { filter: FilterSet; itemKeys: string[] }>()

    for (const [itemKey, spec] of entries) {
      const filter = normalizeFilterSet(spec.filter)
      if (!filter) {
        continue
      }

      const fingerprint = yield* buildFingerprint(filter)
      const existing = fingerprints.get(fingerprint)

      if (existing) {
        existing.itemKeys.push(itemKey)
        continue
      }

      fingerprints.set(fingerprint, {
        filter,
        itemKeys: [itemKey],
      })
    }

    return [...fingerprints.entries()].map(([fingerprint, value]) => ({
      fingerprint,
      filter: value.filter,
      itemKeys: value.itemKeys,
    })) satisfies readonly FilterBatchEntry[]
  })

export const selectTraceEndItemsUseCase = Effect.fn("spans.selectTraceEndItems")(function* (
  input: TraceEndSelectionInput,
) {
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("traceId", input.traceId)
  yield* Effect.annotateCurrentSpan("selection.itemCount", Object.keys(input.items).length)

  const decisions: Record<string, TraceEndSelectionDecision> = {}
  const sampledIn: Array<[string, TraceEndSelectionSpec]> = []

  for (const [itemKey, spec] of Object.entries(input.items)) {
    const samplingKey = spec.sampleKey ?? itemKey
    const isSampled = yield* Effect.promise(() =>
      deterministicSampling({
        sampling: spec.sampling,
        keyParts: [input.organizationId, input.projectId, samplingKey, input.traceId],
      }),
    )

    if (!isSampled) {
      decisions[itemKey] = skippedDecision("sampled-out")
      continue
    }

    const normalizedFilter = normalizeFilterSet(spec.filter)
    if (!normalizedFilter) {
      decisions[itemKey] = selectedDecision()
      continue
    }

    sampledIn.push([itemKey, { ...spec, filter: normalizedFilter }])
  }

  if (sampledIn.length === 0) {
    return decisions satisfies TraceEndSelectionResult
  }

  const filterBatch = yield* buildFilterBatch(sampledIn)
  if (filterBatch.length === 0) {
    return decisions satisfies TraceEndSelectionResult
  }

  const traceRepository = yield* TraceRepository
  const matchingFingerprints = yield* traceRepository.listMatchingFilterIdsByTraceId({
    organizationId: OrganizationId(input.organizationId),
    projectId: ProjectId(input.projectId),
    traceId: TraceId(input.traceId),
    filterSets: filterBatch.map((entry) => ({
      filterId: entry.fingerprint,
      filters: entry.filter,
    })),
  })

  const matchingFingerprintSet = new Set(matchingFingerprints)

  for (const entry of filterBatch) {
    const decision = matchingFingerprintSet.has(entry.fingerprint) ? selectedDecision() : skippedDecision("filter-miss")

    for (const itemKey of entry.itemKeys) {
      decisions[itemKey] = decision
    }
  }

  return decisions satisfies TraceEndSelectionResult
})
