import { describe, expect, it } from "vitest"
import {
  TRACE_SEARCH_CHARS_PER_TOKEN_ESTIMATE,
  TRACE_SEARCH_CHUNK_HEAD_BUDGET_CHARS,
  TRACE_SEARCH_CHUNK_MAX_CHARS,
  TRACE_SEARCH_CHUNK_OVERLAP_CHARS,
  TRACE_SEARCH_CHUNK_TAIL_BUDGET_CHARS,
  TRACE_SEARCH_DOCUMENT_MAX_ESTIMATED_TOKENS,
  TRACE_SEARCH_DOCUMENT_MAX_LENGTH,
  TRACE_SEARCH_MIN_RELEVANCE_SCORE,
} from "./constants.ts"

describe("trace search constants", () => {
  it("derives max document length from the estimated token cap and chars/token ratio", () => {
    expect(TRACE_SEARCH_DOCUMENT_MAX_LENGTH).toBe(
      TRACE_SEARCH_DOCUMENT_MAX_ESTIMATED_TOKENS * TRACE_SEARCH_CHARS_PER_TOKEN_ESTIMATE,
    )
  })

  it("allocates head + tail embedding budgets across the same per-trace char ceiling", () => {
    expect(TRACE_SEARCH_CHUNK_HEAD_BUDGET_CHARS + TRACE_SEARCH_CHUNK_TAIL_BUDGET_CHARS).toBe(
      TRACE_SEARCH_DOCUMENT_MAX_LENGTH,
    )
  })

  it("keeps long-turn slice overlap strictly below the per-chunk max so the stride stays positive", () => {
    expect(TRACE_SEARCH_CHUNK_OVERLAP_CHARS).toBeLessThan(TRACE_SEARCH_CHUNK_MAX_CHARS)
  })

  it("pins the semantic-only floor applied after per-trace max-pool over chunk cosines", () => {
    // Tuned on seeded Acme (2026-05-08); see block comment on TRACE_SEARCH_MIN_RELEVANCE_SCORE.
    expect(TRACE_SEARCH_MIN_RELEVANCE_SCORE).toBe(0.3)
    expect(TRACE_SEARCH_MIN_RELEVANCE_SCORE).toBeGreaterThan(0.25)
    expect(TRACE_SEARCH_MIN_RELEVANCE_SCORE).toBeLessThan(0.4)
  })
})
