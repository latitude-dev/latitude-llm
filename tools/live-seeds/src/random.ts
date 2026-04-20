import { createHash } from "node:crypto"

const UINT32_RANGE = 0x1_0000_0000
const DEFAULT_SEED = 0x6d2b79f5

function hashSeed(seed: string): number {
  const digest = createHash("sha256").update(seed).digest()
  const value = digest.readUInt32BE(0)
  return value === 0 ? DEFAULT_SEED : value
}

export interface SeededRng {
  readonly seed: string
  next: () => number
  float: (min: number, max: number) => number
  int: (min: number, max: number) => number
  chance: (probability: number) => boolean
  pick: <T>(values: readonly T[]) => T
  pickN: <T>(values: readonly T[], count: number) => readonly T[]
  pickWeighted: <T>(values: readonly T[], getWeight: (value: T) => number) => T
  shuffle: <T>(values: readonly T[]) => readonly T[]
  hex: (length: number) => string
  fork: (label: string) => SeededRng
}

export function createSeededRng(seed: string): SeededRng {
  let state = hashSeed(seed) >>> 0

  const next = () => {
    state = (state + DEFAULT_SEED) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE
  }

  const int = (min: number, max: number) => {
    const lower = Math.ceil(Math.min(min, max))
    const upper = Math.floor(Math.max(min, max))
    return Math.floor(next() * (upper - lower + 1)) + lower
  }

  const float = (min: number, max: number) => {
    const lower = Math.min(min, max)
    const upper = Math.max(min, max)
    return next() * (upper - lower) + lower
  }

  const chance = (probability: number) => {
    if (probability <= 0) return false
    if (probability >= 1) return true
    return next() < probability
  }

  const pick = <T>(values: readonly T[]): T => {
    const value = values[int(0, values.length - 1)]
    if (value === undefined) {
      throw new Error("Cannot pick from an empty array")
    }
    return value
  }

  const shuffle = <T>(values: readonly T[]): readonly T[] => {
    const shuffled = [...values]
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = int(0, index)
      ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex] as T, shuffled[index] as T]
    }
    return shuffled
  }

  const pickN = <T>(values: readonly T[], count: number): readonly T[] => {
    if (count <= 0 || values.length === 0) {
      return []
    }
    return shuffle(values).slice(0, Math.min(count, values.length))
  }

  const pickWeighted = <T>(values: readonly T[], getWeight: (value: T) => number): T => {
    const totalWeight = values.reduce((sum, value) => sum + Math.max(0, getWeight(value)), 0)
    if (totalWeight <= 0) {
      throw new Error("Cannot pick from weighted values with no positive weights")
    }

    let threshold = float(0, totalWeight)
    for (const value of values) {
      threshold -= Math.max(0, getWeight(value))
      if (threshold <= 0) {
        return value
      }
    }

    const lastValue = values[values.length - 1]
    if (lastValue === undefined) {
      throw new Error("Cannot pick from an empty array")
    }
    return lastValue
  }

  const hex = (length: number) => {
    const alphabet = "0123456789abcdef"
    let output = ""
    for (let index = 0; index < length; index += 1) {
      output += alphabet[int(0, alphabet.length - 1)]
    }
    return output
  }

  return {
    seed,
    next,
    float,
    int,
    chance,
    pick,
    pickN,
    pickWeighted,
    shuffle,
    hex,
    fork: (label) => createSeededRng(`${seed}:${label}`),
  }
}
