/**
 * Naming quality for a published tree. Wider than the `assertTaxonomyQuality` gate,
 * which only compares a cluster against its own sibling group: this measures the
 * cross-branch collisions that gate lets through, and never blocks on them.
 */

export interface TaxonomyNameQualityCluster {
  readonly id: string
  readonly parentClusterId: string | null
  readonly name: string
}

export interface TaxonomyNameQualityMetrics {
  readonly leafCount: number
  /** Leaves with a real name; a still-"Pending" leaf is not a naming outcome yet. */
  readonly namedLeafCount: number
  /** Named leaves colliding with any other leaf anywhere in the tree, over named leaves. */
  readonly duplicateNameRate: number
  readonly duplicateNameLeafCount: number
  /** The subset the sibling-only gate cannot see. */
  readonly crossBranchDuplicateLeafCount: number
  /**
   * Share of leaf-name words that every one of that leaf's siblings also uses.
   * High means the namer described the shared domain instead of the split: on
   * one measured project 90% of leaf-name words were true of every session.
   */
  readonly sharedSiblingWordShare: number
}

/** Shared with `assertTaxonomyQuality` so the gate and the metric collide on exactly the same names. */
export const normalizedTaxonomyName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

const isNamed = (normalized: string): boolean => normalized.length > 0 && normalized !== "pending"

interface NamedLeaf {
  readonly groupKey: string
  readonly normalized: string
  readonly words: readonly string[]
}

const sharedWordShare = (leaves: readonly NamedLeaf[]): number => {
  const byGroup = new Map<string, NamedLeaf[]>()
  for (const leaf of leaves) byGroup.set(leaf.groupKey, [...(byGroup.get(leaf.groupKey) ?? []), leaf])
  let sharedWords = 0
  let totalWords = 0
  for (const group of byGroup.values()) {
    if (group.length < 2) continue
    const wordSets = group.map((leaf) => new Set(leaf.words))
    const common = [...(wordSets[0] ?? new Set<string>())].filter((word) => wordSets.every((words) => words.has(word)))
    const commonSet = new Set(common)
    for (const leaf of group) {
      totalWords += leaf.words.length
      sharedWords += leaf.words.filter((word) => commonSet.has(word)).length
    }
  }
  return totalWords === 0 ? 0 : sharedWords / totalWords
}

export const taxonomyNameQualityMetrics = (
  clusters: readonly TaxonomyNameQualityCluster[],
): TaxonomyNameQualityMetrics => {
  const parents = new Set(clusters.flatMap((cluster) => (cluster.parentClusterId ? [cluster.parentClusterId] : [])))
  const leafClusters = clusters.filter((cluster) => !parents.has(cluster.id))
  const named: NamedLeaf[] = leafClusters.flatMap((cluster) => {
    const normalized = normalizedTaxonomyName(cluster.name)
    if (!isNamed(normalized)) return []
    return [
      {
        groupKey: cluster.parentClusterId ?? "__root__",
        normalized,
        words: normalized.split(" ").filter((word) => word.length > 0),
      },
    ]
  })

  const byName = new Map<string, NamedLeaf[]>()
  for (const leaf of named) byName.set(leaf.normalized, [...(byName.get(leaf.normalized) ?? []), leaf])
  let duplicateNameLeafCount = 0
  let crossBranchDuplicateLeafCount = 0
  for (const collisions of byName.values()) {
    if (collisions.length < 2) continue
    duplicateNameLeafCount += collisions.length
    if (new Set(collisions.map((leaf) => leaf.groupKey)).size > 1) crossBranchDuplicateLeafCount += collisions.length
  }

  return {
    leafCount: leafClusters.length,
    namedLeafCount: named.length,
    duplicateNameRate: named.length === 0 ? 0 : duplicateNameLeafCount / named.length,
    duplicateNameLeafCount,
    crossBranchDuplicateLeafCount,
    sharedSiblingWordShare: sharedWordShare(named),
  }
}
