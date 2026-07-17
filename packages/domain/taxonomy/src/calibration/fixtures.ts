/**
 * Deterministic fixtures for the adaptive-clustering calibration harness
 * (Phase 1). Every synthetic corpus is generated from a seeded PRNG so the
 * partition signature and recorded baselines are reproducible run-to-run and
 * machine-to-machine — no `Math.random`, no wall-clock, no network. The one
 * optional external input is a committed anonymized pilot export read by
 * `loadNarrowPilotCorpus` (see below).
 *
 * Geometry is controlled, not real text. Each labeled group is a von-Mises-like
 * blob: a group direction blended toward a shared corpus anchor (raising the
 * inter-group centroid cosine to a target band) plus per-member Gaussian jitter
 * scaled by a spread parameter (controlling within-group tightness). This lets a
 * fixture assert a known intent count at a known centroid-cosine separation,
 * which absolute-cosine gating cannot handle and relative separation can.
 *
 * The narrow-domain and pilot fixtures are tuned to the geometry measured on the
 * real narrow-domain pilot corpus (identified in the private Linear project), not
 * to idealized blobs: sibling centroids sit in the ~0.86 cosine band (real
 * pilot: 0.84–0.89) and members are loose enough that a coherent split's relative
 * separation lands at ~0.5 — inside the real 0.45–0.90 range, not the ≥1.2 that
 * clean equal blobs produce. The pilot fixture also carries the real dominant-blob
 * + tail size imbalance (one ~360-member intent, four smaller ones). The upshot:
 * these fixtures resolve into 3–5 coherent children at the calibrated
 * `minRelativeSeparation` (0.45) and collapse at 0.60 — so the committed test can
 * actually pin the calibrated value instead of passing for any threshold.
 *
 * Real anonymized pilot vectors are exported through the product read surface
 * (never a raw ClickHouse/Postgres dump) into `fixtures-data/narrow-pilot.json`
 * when available; `loadNarrowPilotCorpus` reads that file if present and otherwise
 * returns this reproducible synthetic model.
 */

import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { normalizeEmbedding } from "@domain/shared"

export interface LabeledCorpus {
  readonly name: string
  readonly description: string
  /** L2-normalized embeddings. */
  readonly embeddings: readonly (readonly number[])[]
  /** Ground-truth group label per embedding (index-aligned with `embeddings`). */
  readonly labels: readonly string[]
  /** Deterministic build seed to pass to the builders. */
  readonly seed: number
  readonly dimensions: number
}

// Dimensions for quality fixtures. Lower than the production 2048 so the full
// suite stays fast; the geometry the algorithm reasons about (cosine separation,
// within-group spread) is dimension-independent, and 256 random dims are already
// near-orthogonal. The runtime/memory benchmark uses the real 2048.
export const QUALITY_FIXTURE_DIMENSIONS = 256

const createRng = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Standard normal via Box-Muller, driven by the seeded uniform PRNG. */
const gaussian = (rng: () => number): number => {
  const u1 = Math.max(rng(), 1e-12)
  const u2 = rng()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

const randomUnitVector = (dimensions: number, rng: () => number): number[] => {
  const vector = new Array<number>(dimensions)
  for (let i = 0; i < dimensions; i++) vector[i] = gaussian(rng)
  return normalizeEmbedding(vector)
}

/**
 * Blend a group direction toward the shared anchor. With near-orthogonal random
 * directions the resulting pairwise centroid cosine is ≈ anchorWeight² /
 * (anchorWeight² + (1 - anchorWeight)²); the fixtures pick anchorWeight to land
 * each corpus in its intended sibling-cosine band.
 */
const blendTowardAnchor = (anchor: readonly number[], direction: readonly number[], anchorWeight: number): number[] => {
  const dimensions = anchor.length
  const blended = new Array<number>(dimensions)
  for (let i = 0; i < dimensions; i++)
    blended[i] = anchorWeight * (anchor[i] ?? 0) + (1 - anchorWeight) * (direction[i] ?? 0)
  return normalizeEmbedding(blended)
}

export interface GroupSpec {
  readonly label: string
  readonly size: number
  /** Higher → sibling centroids closer to each other (narrower domain). */
  readonly anchorWeight: number
  /** Per-member Gaussian jitter; higher → looser within-group spread. */
  readonly spread: number
}

interface BuildCorpusInput {
  readonly name: string
  readonly description: string
  readonly seed: number
  readonly dimensions?: number
  readonly groups: readonly GroupSpec[]
}

const buildCorpus = ({
  name,
  description,
  seed,
  dimensions = QUALITY_FIXTURE_DIMENSIONS,
  groups,
}: BuildCorpusInput): LabeledCorpus => {
  const rng = createRng(seed)
  const anchor = randomUnitVector(dimensions, rng)
  const embeddings: number[][] = []
  const labels: string[] = []

  for (const group of groups) {
    const direction = randomUnitVector(dimensions, rng)
    const centroid = blendTowardAnchor(anchor, direction, group.anchorWeight)
    for (let member = 0; member < group.size; member++) {
      const jittered = new Array<number>(dimensions)
      for (let i = 0; i < dimensions; i++) jittered[i] = (centroid[i] ?? 0) + group.spread * gaussian(rng)
      embeddings.push(normalizeEmbedding(jittered))
      labels.push(group.label)
    }
  }

  return { name, description, embeddings, labels, seed, dimensions }
}

// ---------------------------------------------------------------------------
// Broad, seeded support corpora — the analogue of the seeded Acme corpus. Groups
// are well-separated topics (low anchor weight) at a realistic support-desk
// scale. Static and adaptive should agree closely here (regression tolerance).
// ---------------------------------------------------------------------------

export const buildRetailSupportCorpus = (): LabeledCorpus =>
  buildCorpus({
    name: "retail-support",
    description: "Seeded retail support desk: broad, well-separated topics.",
    seed: 0x5e7a11,
    groups: [
      { label: "order-tracking", size: 180, anchorWeight: 0.35, spread: 0.05 },
      { label: "returns-refunds", size: 150, anchorWeight: 0.35, spread: 0.05 },
      { label: "payment-issues", size: 120, anchorWeight: 0.35, spread: 0.05 },
      { label: "product-availability", size: 110, anchorWeight: 0.35, spread: 0.05 },
      { label: "account-login", size: 90, anchorWeight: 0.35, spread: 0.05 },
      { label: "shipping-delays", size: 130, anchorWeight: 0.35, spread: 0.05 },
    ],
  })

export const buildTelecomSupportCorpus = (): LabeledCorpus =>
  buildCorpus({
    name: "telecom-support",
    description: "Seeded telecom support desk: broad, well-separated topics.",
    seed: 0x7e1ec0,
    groups: [
      { label: "billing-disputes", size: 160, anchorWeight: 0.35, spread: 0.05 },
      { label: "network-outage", size: 140, anchorWeight: 0.35, spread: 0.05 },
      { label: "plan-changes", size: 120, anchorWeight: 0.35, spread: 0.05 },
      { label: "device-setup", size: 100, anchorWeight: 0.35, spread: 0.05 },
      { label: "roaming", size: 80, anchorWeight: 0.35, spread: 0.05 },
    ],
  })

export const buildAirlineSupportCorpus = (): LabeledCorpus =>
  buildCorpus({
    name: "airline-support",
    description: "Seeded airline support desk: broad, well-separated topics.",
    seed: 0xa14211e,
    groups: [
      { label: "flight-changes", size: 170, anchorWeight: 0.35, spread: 0.05 },
      { label: "baggage", size: 130, anchorWeight: 0.35, spread: 0.05 },
      { label: "refunds", size: 110, anchorWeight: 0.35, spread: 0.05 },
      { label: "check-in", size: 120, anchorWeight: 0.35, spread: 0.05 },
      { label: "loyalty-miles", size: 90, anchorWeight: 0.35, spread: 0.05 },
      { label: "seat-selection", size: 70, anchorWeight: 0.35, spread: 0.05 },
    ],
  })

// ---------------------------------------------------------------------------
// Narrow-domain synthetic: known intents whose sibling centroid cosines sit
// ABOVE 0.85 — the case the fixed absolute gate collapses and adaptive must
// resolve into 3–5 root children.
// ---------------------------------------------------------------------------

export const buildNarrowDomainCorpus = (): LabeledCorpus =>
  buildCorpus({
    name: "narrow-domain",
    description: "Four intents at sibling cosine ~0.87, loose enough that splits sit at real relative separation.",
    seed: 0x0a44011,
    groups: [
      { label: "keyword-quality", size: 120, anchorWeight: 0.72, spread: 0.05 },
      { label: "bid-adjustments", size: 110, anchorWeight: 0.72, spread: 0.05 },
      { label: "budget-pacing", size: 100, anchorWeight: 0.72, spread: 0.05 },
      { label: "negative-keywords", size: 90, anchorWeight: 0.72, spread: 0.05 },
    ],
  })

// ---------------------------------------------------------------------------
// narrow-domain pilot stand-in — narrow-domain ads-analytics intents in the 0.90–0.98
// sibling band with coarse human labels. See file header on the real export.
// ---------------------------------------------------------------------------

export const buildNarrowPilotSyntheticCorpus = (): LabeledCorpus =>
  buildCorpus({
    name: "narrow-pilot-synthetic",
    description:
      "Synthetic model of the ads pilot: sibling cosine ~0.86, dominant-blob + tail sizes, splits at real relative separation.",
    seed: 0x097e0,
    groups: [
      { label: "performance-reporting", size: 360, anchorWeight: 0.71, spread: 0.05 },
      { label: "search-terms-audit", size: 130, anchorWeight: 0.71, spread: 0.05 },
      { label: "ad-creative", size: 110, anchorWeight: 0.71, spread: 0.05 },
      { label: "improvement-review", size: 70, anchorWeight: 0.71, spread: 0.05 },
      { label: "bid-strategy", size: 60, anchorWeight: 0.71, spread: 0.05 },
    ],
  })

interface PilotFixtureRow {
  readonly embedding: readonly number[]
  readonly label: string
}

/**
 * Where an anonymized pilot export is dropped (through a product read surface,
 * never a raw DB dump). Shape: `PilotFixtureRow[]`.
 */
const NARROW_PILOT_FIXTURE_PATH = fileURLToPath(new URL("./fixtures-data/narrow-pilot.json", import.meta.url))

/**
 * Returns the real anonymized pilot corpus when `fixtures-data/narrow-pilot.json`
 * is present, otherwise the reproducible synthetic model. A malformed file throws
 * rather than silently falling back, so calibration never runs on bad data while
 * appearing to use the real fixture.
 */
export const loadNarrowPilotCorpus = (): LabeledCorpus => {
  if (!existsSync(NARROW_PILOT_FIXTURE_PATH)) return buildNarrowPilotSyntheticCorpus()
  const rows = JSON.parse(readFileSync(NARROW_PILOT_FIXTURE_PATH, "utf8")) as PilotFixtureRow[]
  if (!Array.isArray(rows) || rows.length === 0 || !rows[0]?.embedding?.length) {
    throw new Error(`narrow-pilot fixture at ${NARROW_PILOT_FIXTURE_PATH} is empty or malformed`)
  }
  return {
    name: "narrow-pilot",
    description: "Real anonymized pilot embeddings from fixtures-data/narrow-pilot.json.",
    embeddings: rows.map((row) => normalizeEmbedding(row.embedding)),
    labels: rows.map((row) => row.label),
    seed: 0x097e0,
    dimensions: rows[0]?.embedding.length ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Shape stressors.
// ---------------------------------------------------------------------------

/** One tight blob — must stay a leaf under both builders. */
export const buildUnimodalCorpus = (): LabeledCorpus =>
  buildCorpus({
    name: "unimodal",
    description: "A single tight topic; no defensible split exists.",
    seed: 0x1111,
    groups: [{ label: "single", size: 300, anchorWeight: 0, spread: 0.06 }],
  })

/** Many well-separated topics — a wide, easy multi-topic partition. */
export const buildDiffuseMultiTopicCorpus = (): LabeledCorpus =>
  buildCorpus({
    name: "diffuse-multi-topic",
    description: "Eight diffuse, well-separated topics.",
    seed: 0x2222,
    groups: Array.from({ length: 8 }, (_, index) => ({
      label: `topic-${index}`,
      size: 60,
      anchorWeight: 0.2,
      spread: 0.06,
    })),
  })

/**
 * Imbalanced long-tail: a few dominant topics plus tiny tail groups below the
 * root minimum-cluster floor. The tail must not surface as root children.
 */
export const buildImbalancedLongTailCorpus = (): LabeledCorpus =>
  buildCorpus({
    name: "imbalanced-long-tail",
    description: "Three dominant topics plus sub-floor tail groups.",
    seed: 0x3333,
    groups: [
      { label: "head-a", size: 260, anchorWeight: 0.3, spread: 0.05 },
      { label: "head-b", size: 220, anchorWeight: 0.3, spread: 0.05 },
      { label: "head-c", size: 180, anchorWeight: 0.3, spread: 0.05 },
      { label: "tail-1", size: 6, anchorWeight: 0.3, spread: 0.05 },
      { label: "tail-2", size: 5, anchorWeight: 0.3, spread: 0.05 },
      { label: "tail-3", size: 4, anchorWeight: 0.3, spread: 0.05 },
    ],
  })

/**
 * Rare-intent + duplicate-vector: dominant topics, one rare intent below the
 * floor, and a block of exact-duplicate vectors (zero within-group spread) that
 * must not blow up the relative-separation ratio (guarded by the 1e-6 floor).
 */
export const buildRareIntentDuplicateCorpus = (): LabeledCorpus => {
  const base = buildCorpus({
    name: "rare-intent-duplicate",
    description: "Dominant topics, a sub-floor rare intent, and a duplicate-vector block.",
    seed: 0x4444,
    groups: [
      { label: "common-a", size: 240, anchorWeight: 0.3, spread: 0.05 },
      { label: "common-b", size: 200, anchorWeight: 0.3, spread: 0.05 },
      { label: "rare", size: 7, anchorWeight: 0.3, spread: 0.05 },
    ],
  })
  // Append an exact-duplicate block: 40 identical unit vectors.
  const rng = createRng(0x44440d0c)
  const duplicate = randomUnitVector(base.dimensions, rng)
  const embeddings = [...base.embeddings.map((v) => [...v])]
  const labels = [...base.labels]
  for (let i = 0; i < 40; i++) {
    embeddings.push([...duplicate])
    labels.push("duplicate")
  }
  return { ...base, embeddings, labels }
}

// ---------------------------------------------------------------------------
// Registry.
// ---------------------------------------------------------------------------

export const buildAllQualityFixtures = (): readonly LabeledCorpus[] => [
  buildRetailSupportCorpus(),
  buildTelecomSupportCorpus(),
  buildAirlineSupportCorpus(),
  buildNarrowDomainCorpus(),
  loadNarrowPilotCorpus(),
  buildUnimodalCorpus(),
  buildDiffuseMultiTopicCorpus(),
  buildImbalancedLongTailCorpus(),
  buildRareIntentDuplicateCorpus(),
]
