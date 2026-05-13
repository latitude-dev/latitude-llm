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
 */

interface Anchor {
  /** Inclusive lower bound of LOC the anchor applies to. */
  readonly threshold: number
  /** A short phrase rendered after the count, e.g. "≈ a TED talk transcript". */
  readonly phrase: (count: number) => string
}

const formatPercent = (count: number, denom: number): string => {
  const pct = Math.round((count / denom) * 100)
  if (pct <= 0) return "<1%"
  if (pct >= 100) return `${Math.round(count / denom)}×`
  return `${pct}%`
}

// Lines you and Claude wrote — Edit additions + new files. Ordered low → high;
// pick the highest-threshold anchor the count exceeds.
const WRITTEN_ANCHORS: readonly Anchor[] = [
  { threshold: 0, phrase: () => "≈ a couple of haiku" },
  { threshold: 200, phrase: () => "≈ a TED talk transcript" },
  { threshold: 1_000, phrase: () => "≈ a short academic paper" },
  { threshold: 5_000, phrase: () => "≈ a novella" },
  { threshold: 15_000, phrase: (n) => `≈ ${formatPercent(n, 145_000)} of the Apollo 11 guidance code` },
  { threshold: 145_000, phrase: () => "≈ the entire Apollo 11 guidance code" },
  { threshold: 200_000, phrase: () => "≈ the SQLite codebase" },
  { threshold: 500_000, phrase: (n) => `≈ ${formatPercent(n, 700_000)} of the original Doom source` },
  { threshold: 1_500_000, phrase: () => "≈ Photoshop 1.0 (and then some)" },
  { threshold: 5_000_000, phrase: (n) => `≈ ${formatPercent(n, 27_000_000)} of the Linux kernel` },
  { threshold: 30_000_000, phrase: () => "≈ the entire Linux kernel" },
]

// Lines Claude read for you. Tuned for higher magnitudes — reading volume
// runs significantly larger than writing volume in practice (typical
// read-to-write ratio for a Claude Code session is 5-20x).
const READ_ANCHORS: readonly Anchor[] = [
  { threshold: 0, phrase: () => "≈ a few emails" },
  { threshold: 1_000, phrase: () => "≈ a short story" },
  { threshold: 5_000, phrase: () => "≈ a magazine feature" },
  { threshold: 20_000, phrase: () => "≈ a novella" },
  { threshold: 80_000, phrase: () => "≈ a full-length novel" },
  { threshold: 200_000, phrase: () => "≈ War and Peace" },
  { threshold: 800_000, phrase: () => "≈ the Lord of the Rings trilogy" },
  { threshold: 3_000_000, phrase: () => "≈ the Encyclopedia Britannica" },
  {
    threshold: 20_000_000,
    phrase: (n) => `≈ ${formatPercent(n, 167_000_000)} of the Library of Congress's text holdings`,
  },
]

const pickAnchor = (anchors: readonly Anchor[], count: number): string => {
  let chosen: Anchor | undefined
  for (const anchor of anchors) {
    if (count >= anchor.threshold) chosen = anchor
  }
  return chosen ? chosen.phrase(count) : (anchors[0]?.phrase(count) ?? "")
}

export const pickWrittenAnchor = (linesWritten: number): string => pickAnchor(WRITTEN_ANCHORS, linesWritten)

export const pickReadAnchor = (linesRead: number): string => pickAnchor(READ_ANCHORS, linesRead)
