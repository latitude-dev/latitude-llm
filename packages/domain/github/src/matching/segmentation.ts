import { GITHUB_SOURCE_TEXT_MAX_CHARS } from "../constants.ts"
import type { GithubTextSource } from "./types.ts"

const SENTENCE_TERMINATORS = /[.;!?]+/

/**
 * Splits a source text into the segments a keyword must share with a slug to
 * classify it (5.5). Prose sources split into lines, then sentences; a branch
 * name is a single segment whose `/`, `_`, `.` separators become spaces so
 * `fix/lat-xy9z-timeout` reads as one keyword+slug segment. Each source is
 * capped at {@link GITHUB_SOURCE_TEXT_MAX_CHARS} first.
 */
export const segmentText = (source: GithubTextSource, text: string): string[] => {
  const capped = text.slice(0, GITHUB_SOURCE_TEXT_MAX_CHARS)

  if (source === "branchName") {
    const normalized = capped
      .replace(/[/_.]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
    return normalized.length > 0 ? [normalized] : []
  }

  const segments: string[] = []
  for (const line of capped.split(/\r?\n/)) {
    for (const sentence of line.split(SENTENCE_TERMINATORS)) {
      const normalized = sentence.replace(/\s+/g, " ").trim()
      if (normalized.length > 0) segments.push(normalized)
    }
  }
  return segments
}
