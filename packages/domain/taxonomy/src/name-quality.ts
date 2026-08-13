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
  /**
   * Leaf-name pairs anywhere in the tree that share most of their vocabulary, over every pair compared.
   * Exact collisions are only this metric's tail: siblings usually collapse onto shared words, not one name.
   */
  readonly nearDuplicateNameRate: number
  readonly nearDuplicateNamePairCount: number
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

const wordSegmenter = new Intl.Segmenter(undefined, { granularity: "word" })

/** The normalizer above empties Chinese, Japanese and Thai names, and whitespace leaves them one token. */
const segmentedNameTokens = (name: string): readonly string[] =>
  [...wordSegmenter.segment(name.normalize("NFC").toLowerCase())]
    .filter((segment) => segment.isWordLike === true)
    .map((segment) => segment.segment)

// ICU knows no domain compounds and over-splits them into single characters, so CJK scores skew high against
// English, and 0.5 is calibrated on English only. Same meaning with no shared surface is invisible here:
// レポート生成 vs 報告書作成 scores 0.
const NEAR_DUPLICATE_NAME_SIMILARITY = 0.5

const jaccard = (a: ReadonlySet<string>, b: ReadonlySet<string>): number => {
  const shared = [...a].filter((token) => b.has(token)).length
  const union = a.size + b.size - shared
  return union === 0 ? 0 : shared / union
}

/** Every pair in the tree, not just siblings: leaves under different parents render as adjacent rows. */
const nearDuplicateNamePairs = (leafNames: readonly string[]): { pairs: number; nearDuplicates: number } => {
  const tokenSets = leafNames
    .map((name) => segmentedNameTokens(name))
    .filter((tokens) => tokens.length > 0 && tokens.join(" ") !== "pending")
    .map((tokens) => new Set(tokens))
  let pairs = 0
  let nearDuplicates = 0
  tokenSets.forEach((tokens, index) => {
    for (const other of tokenSets.slice(index + 1)) {
      pairs += 1
      if (jaccard(tokens, other) >= NEAR_DUPLICATE_NAME_SIMILARITY) nearDuplicates += 1
    }
  })
  return { pairs, nearDuplicates }
}

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

  const nearDuplicates = nearDuplicateNamePairs(leafClusters.map((cluster) => cluster.name))

  return {
    leafCount: leafClusters.length,
    namedLeafCount: named.length,
    duplicateNameRate: named.length === 0 ? 0 : duplicateNameLeafCount / named.length,
    duplicateNameLeafCount,
    crossBranchDuplicateLeafCount,
    sharedSiblingWordShare: sharedWordShare(named),
    nearDuplicateNameRate: nearDuplicates.pairs === 0 ? 0 : nearDuplicates.nearDuplicates / nearDuplicates.pairs,
    nearDuplicateNamePairCount: nearDuplicates.nearDuplicates,
  }
}
