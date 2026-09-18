import type { CostFamily } from "../entities/cost-evidence.ts"

/**
 * One signal occurrence on one session, with whatever identity the discovery path left behind.
 *
 * `findingKey` is present when the occurrence came from a deterministic reader's selected finding;
 * `atomIds` are the source atoms that finding covered. Either is enough to link.
 */
export interface SignalOccurrence {
  readonly signalId: string
  readonly sessionId: string
  readonly findingKey?: string | undefined
  readonly atomIds: readonly string[]
  readonly inclusionProbability?: number
}

/**
 * A signal occurrence that lands on a resource some family already charges.
 *
 * It explains that penalty and adds nothing: the deficit is already in the family's numerator, so
 * charging the signal too would bill one behaviour twice, once as a metric and once as a cluster.
 */
export interface LinkedSignalOccurrence {
  readonly occurrence: SignalOccurrence
  readonly families: readonly CostFamily[]
  readonly matchedAtomIds: readonly string[]
}

export interface SignalLinkage {
  readonly linked: readonly LinkedSignalOccurrence[]
  readonly unlinked: readonly SignalOccurrence[]
}

/**
 * Splits signal occurrences into the ones that explain an existing penalty and the ones that might
 * add a residual.
 *
 * Linkage is deliberately generous: a finding key that resolves to a charged atom, or any direct
 * atom overlap, is enough. Being generous here is the conservative direction for the score — every
 * occurrence pushed to `linked` becomes attribution rather than a second penalty, so the failure
 * mode is under-counting a signal's effect, never double-counting a family's.
 */
export const linkSignalOccurrences = ({
  occurrences,
  ownedAtomsByFamily,
  atomIdsByFindingKey,
}: {
  readonly occurrences: readonly SignalOccurrence[]
  readonly ownedAtomsByFamily: ReadonlyMap<CostFamily, ReadonlySet<string>>
  readonly atomIdsByFindingKey?: ReadonlyMap<string, readonly string[]>
}): SignalLinkage => {
  const linked: LinkedSignalOccurrence[] = []
  const unlinked: SignalOccurrence[] = []

  for (const occurrence of occurrences) {
    const fromFinding =
      occurrence.findingKey === undefined ? [] : (atomIdsByFindingKey?.get(occurrence.findingKey) ?? [])
    const candidateAtoms = new Set([...occurrence.atomIds, ...fromFinding])
    const families: CostFamily[] = []
    const matchedAtomIds = new Set<string>()

    for (const [family, owned] of ownedAtomsByFamily) {
      const matched = [...candidateAtoms].filter((atomId) => owned.has(atomId))
      if (matched.length === 0) continue
      families.push(family)
      for (const atomId of matched) matchedAtomIds.add(atomId)
    }

    if (families.length > 0) linked.push({ occurrence, families, matchedAtomIds: [...matchedAtomIds] })
    else unlinked.push(occurrence)
  }

  return { linked, unlinked }
}
