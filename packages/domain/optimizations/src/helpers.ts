import type { OptimizationCandidate, OptimizationDatasetSplit, OptimizationExample } from "./entities/optimization.ts"

const stableSeededHash = (value: string, seed: number): number => {
  let hash = 0x811c9dc5 ^ seed

  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return hash >>> 0
}

export const hashOptimizationCandidateText = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export const createOptimizationCandidate = async (input: {
  readonly componentId: string
  readonly text: string
}): Promise<OptimizationCandidate> => ({
  componentId: input.componentId,
  text: input.text,
  hash: await hashOptimizationCandidateText(input.text),
})

interface StratifiedOptimizationExample {
  readonly id: string
  readonly label: string
}

const orderExamplesBySeed = <T extends { readonly id: string }>(examples: readonly T[], seed: number): T[] =>
  [...examples].sort((left, right) => {
    const leftHash = stableSeededHash(left.id, seed)
    const rightHash = stableSeededHash(right.id, seed)

    if (leftHash === rightHash) {
      return left.id.localeCompare(right.id)
    }

    return leftHash - rightHash
  })

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)

export const splitOptimizationExamples = (input: {
  readonly examples: readonly StratifiedOptimizationExample[]
  readonly seed: number
  readonly trainRatio: number
  readonly validationRatio: number
}): OptimizationDatasetSplit => {
  const ordered = orderExamplesBySeed(input.examples, input.seed)

  if (ordered.length <= 1) {
    return {
      trainset: ordered.map(({ id }) => ({ id })),
      valset: [],
    }
  }

  const totalRatio = input.trainRatio + input.validationRatio
  const normalizedTrainRatio = totalRatio === 0 ? 0.5 : input.trainRatio / totalRatio
  const targetTrainCount = clamp(Math.round(ordered.length * normalizedTrainRatio), 1, ordered.length - 1)
  const grouped = new Map<string, StratifiedOptimizationExample[]>()

  for (const example of ordered) {
    const bucket = grouped.get(example.label)
    if (bucket) {
      bucket.push(example)
      continue
    }

    grouped.set(example.label, [example])
  }

  const allocations = [...grouped.entries()]
    .sort(([leftLabel], [rightLabel]) => leftLabel.localeCompare(rightLabel))
    .map(([label, examples]) => {
      const idealTrainCount = examples.length * normalizedTrainRatio
      return {
        label,
        examples,
        trainCount: Math.floor(idealTrainCount),
        fractionalRemainder: idealTrainCount - Math.floor(idealTrainCount),
      }
    })

  let remainingTrainSlots =
    targetTrainCount - allocations.reduce((total, allocation) => total + allocation.trainCount, 0)

  for (const allocation of [...allocations].sort((left, right) => {
    if (left.fractionalRemainder === right.fractionalRemainder) {
      const leftTieBreaker = stableSeededHash(left.label, input.seed)
      const rightTieBreaker = stableSeededHash(right.label, input.seed)
      if (leftTieBreaker === rightTieBreaker) {
        return left.label.localeCompare(right.label)
      }
      return leftTieBreaker - rightTieBreaker
    }

    return right.fractionalRemainder - left.fractionalRemainder
  })) {
    if (remainingTrainSlots === 0) {
      break
    }

    if (allocation.trainCount >= allocation.examples.length) {
      continue
    }

    allocation.trainCount += 1
    remainingTrainSlots -= 1
  }

  const trainset = allocations.flatMap((allocation) =>
    allocation.examples.slice(0, allocation.trainCount).map<OptimizationExample>(({ id }) => ({ id })),
  )
  const valset = allocations.flatMap((allocation) =>
    allocation.examples.slice(allocation.trainCount).map<OptimizationExample>(({ id }) => ({ id })),
  )

  return {
    trainset: orderExamplesBySeed(trainset, input.seed),
    valset: orderExamplesBySeed(valset, input.seed),
  }
}
