/**
 * Lines-of-code comparison anchors for the Wrapped email. These turn a raw
 * LOC number into something memorable and shareable — the playful
 * "you wrote N lines, that's roughly Y" reveal.
 *
 * Each `pickWrittenAnchor` / `pickReadAnchor` picks the single most-fitting
 * anchor for the given count. Both are pure — easy to test, easy to swap.
 *
 * Reference points are intentionally a mix of programming-history famous
 * (Apollo, Doom, Linux), reading-volume relatable (a TED talk transcript,
 * a novel), and the absurd (the entire macOS source). Stay just below the
 * user's actual number when possible so the comparison feels like a
 * genuine flex rather than a put-down.
 *
 * Anchors come back split into a small muted `prefix` (e.g. "≈" or "≈ 25% of")
 * and a large accent-coloured `emphasis` (e.g. "the Apollo 11 guidance code")
 * so the email can give the noun phrase visual weight.
 */

/** Structured anchor: prefix is small/muted, emphasis is large/accent. */
interface LocAnchor {
  readonly prefix: string
  readonly emphasis: string
}

interface AnchorRule {
  /** Inclusive lower bound of LOC the anchor applies to. */
  readonly threshold: number
  /** Builder that returns the structured anchor for a given count. */
  readonly build: (count: number) => LocAnchor
}

const formatPercent = (count: number, denom: number): string => {
  const pct = Math.round((count / denom) * 100)
  if (pct <= 0) return "<1%"
  if (pct >= 100) return `${Math.round(count / denom)}×`
  return `${pct}%`
}

// Lines you and Claude wrote — Edit additions + new files. Ordered low → high;
// pick the highest-threshold anchor the count exceeds.
const WRITTEN_ANCHORS: readonly AnchorRule[] = [
  { threshold: 0, build: () => ({ prefix: "≈", emphasis: "a couple of haiku" }) },
  { threshold: 200, build: () => ({ prefix: "≈", emphasis: "a TED talk transcript" }) },
  { threshold: 1_000, build: () => ({ prefix: "≈", emphasis: "a short academic paper" }) },
  { threshold: 5_000, build: () => ({ prefix: "≈", emphasis: "a novella" }) },
  {
    threshold: 15_000,
    build: (n) => ({ prefix: `≈ ${formatPercent(n, 145_000)} of`, emphasis: "the Apollo 11 guidance code" }),
  },
  { threshold: 145_000, build: () => ({ prefix: "≈", emphasis: "the entire Apollo 11 guidance code" }) },
  { threshold: 200_000, build: () => ({ prefix: "≈", emphasis: "the SQLite codebase" }) },
  {
    threshold: 500_000,
    build: (n) => ({ prefix: `≈ ${formatPercent(n, 700_000)} of`, emphasis: "the original Doom source" }),
  },
  { threshold: 1_500_000, build: () => ({ prefix: "≈", emphasis: "Photoshop 1.0 (and then some)" }) },
  {
    threshold: 5_000_000,
    build: (n) => ({ prefix: `≈ ${formatPercent(n, 27_000_000)} of`, emphasis: "the Linux kernel" }),
  },
  { threshold: 30_000_000, build: () => ({ prefix: "≈", emphasis: "the entire Linux kernel" }) },
]

// Lines Claude read for you. Tuned for higher magnitudes — reading volume
// runs significantly larger than writing volume in practice (typical
// read-to-write ratio for a Claude Code session is 5-20x).
const READ_ANCHORS: readonly AnchorRule[] = [
  { threshold: 0, build: () => ({ prefix: "≈", emphasis: "a few emails" }) },
  { threshold: 1_000, build: () => ({ prefix: "≈", emphasis: "a short story" }) },
  { threshold: 5_000, build: () => ({ prefix: "≈", emphasis: "a magazine feature" }) },
  { threshold: 20_000, build: () => ({ prefix: "≈", emphasis: "a novella" }) },
  { threshold: 80_000, build: () => ({ prefix: "≈", emphasis: "a full-length novel" }) },
  { threshold: 200_000, build: () => ({ prefix: "≈", emphasis: "War and Peace" }) },
  { threshold: 800_000, build: () => ({ prefix: "≈", emphasis: "the Lord of the Rings trilogy" }) },
  { threshold: 3_000_000, build: () => ({ prefix: "≈", emphasis: "the Encyclopedia Britannica" }) },
  {
    threshold: 20_000_000,
    build: (n) => ({
      prefix: `≈ ${formatPercent(n, 167_000_000)} of`,
      emphasis: "the Library of Congress's text holdings",
    }),
  },
]

const EMPTY_ANCHOR: LocAnchor = { prefix: "", emphasis: "" }

const pickAnchor = (rules: readonly AnchorRule[], count: number): LocAnchor => {
  let chosen: AnchorRule | undefined
  for (const rule of rules) {
    if (count >= rule.threshold) chosen = rule
  }
  return chosen ? chosen.build(count) : (rules[0]?.build(count) ?? EMPTY_ANCHOR)
}

export const pickWrittenAnchor = (linesWritten: number): LocAnchor => pickAnchor(WRITTEN_ANCHORS, linesWritten)

export const pickReadAnchor = (linesRead: number): LocAnchor => pickAnchor(READ_ANCHORS, linesRead)
