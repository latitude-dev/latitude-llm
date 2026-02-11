/**
 * Interleaves items from multiple lists into a single balanced list.
 *
 * This function takes a map of lists and combines them into a single list where:
 * - Each source list contributes proportionally to its original size
 * - Items from different sources are evenly distributed throughout the result
 * - When some sources have fewer items than their proportional share, the
 *   "padding" from larger sources is distributed evenly (not appended at the end)
 *
 * @example
 * // With sources having [10, 5, 3] items and limit 18:
 * // [A,B,A,C,A,B,A,A,C,B,A,A,B,C,A,A,B,A] (padding distributed)
 *
 * @param maplist - A record mapping keys to arrays of items to interleave
 * @param limit - Maximum number of items to include in the result (default: Infinity)
 * @param random - Whether to shuffle each source list before interleaving (default: true)
 * @returns A balanced interleaved array of items
 */
export function interleaveList<T>(
  maplist: Record<string | number, T[]>,
  limit: number = Infinity,
  random: boolean = true,
): T[] {
  const sources = Object.values(maplist)
    .map((list) => (random ? [...list].sort(() => Math.random() - 0.5) : list))
    .filter((list) => list.length > 0)

  if (sources.length === 0) return []

  const totalAvailable = sources.reduce((sum, s) => sum + s.length, 0)
  const actualTarget = Math.min(limit, totalAvailable)

  if (actualTarget === 0) return []

  const allocations = sources.map((items) => {
    const proportion = items.length / totalAvailable
    return {
      items,
      target: Math.min(items.length, Math.round(proportion * actualTarget)),
      taken: 0,
    }
  })

  let totalAllocated = allocations.reduce(
    (sum, a) => sum + Math.min(a.target, a.items.length),
    0,
  )
  while (totalAllocated < actualTarget) {
    const withCapacity = allocations.filter((a) => a.target < a.items.length)
    if (withCapacity.length === 0) break
    withCapacity.sort(
      (a, b) => b.items.length - b.target - (a.items.length - a.target),
    )[0]!.target++
    totalAllocated++
  }
  while (totalAllocated > actualTarget) {
    allocations.sort((a, b) => b.target - a.target)[0]!.target--
    totalAllocated--
  }

  const result: T[] = []

  for (let i = 0; i < actualTarget; i++) {
    let bestIdx = -1
    let bestDeficit = -Infinity

    for (let j = 0; j < allocations.length; j++) {
      const alloc = allocations[j]!
      if (alloc.taken >= alloc.items.length || alloc.taken >= alloc.target) {
        continue
      }

      const expectedByNow = ((i + 1) / actualTarget) * alloc.target
      const deficit = expectedByNow - alloc.taken

      if (deficit > bestDeficit) {
        bestDeficit = deficit
        bestIdx = j
      }
    }

    if (bestIdx === -1) {
      for (let j = 0; j < allocations.length; j++) {
        if (allocations[j]!.taken < allocations[j]!.items.length) {
          bestIdx = j
          break
        }
      }
    }

    if (bestIdx === -1) break

    result.push(allocations[bestIdx]!.items[allocations[bestIdx]!.taken++]!)
  }

  return result
}
