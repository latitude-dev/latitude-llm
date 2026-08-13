import { describe, expect, it } from "vitest"
import { GITHUB_SOURCE_TEXT_MAX_CHARS } from "../constants.ts"
import { DEFAULT_GITHUB_MONITOR_SETTINGS, type GithubMatchingRules } from "../entities/github-sync-config.ts"
import { matchTexts } from "./match-texts.ts"
import type { GithubMatchAction, MatchResult, MatchTextInput } from "./types.ts"

const DEFAULT_RULES = DEFAULT_GITHUB_MONITOR_SETTINGS.rules

interface ExpectedMatch {
  readonly slug: string
  readonly action: GithubMatchAction
  readonly sources?: readonly MatchTextInput["source"][]
}

interface Case {
  readonly name: string
  readonly inputs: readonly MatchTextInput[]
  readonly rules?: GithubMatchingRules
  readonly expected: readonly ExpectedMatch[]
}

const normalize = (results: readonly MatchResult[]) =>
  [...results]
    .map((result) => ({ slug: result.slug, action: result.action, sources: [...result.sources].sort() }))
    .sort((a, b) => a.slug.localeCompare(b.slug))

const pr = (text: string): MatchTextInput => ({ source: "prTitle", text })
const body = (text: string): MatchTextInput => ({ source: "prBody", text })
const commit = (text: string): MatchTextInput => ({ source: "commitMessage", text })
const branch = (text: string): MatchTextInput => ({ source: "branchName", text })

// The golden corpus — the contract for every future matcher change (P2-5).
const cases: readonly Case[] = [
  // --- default resolve keyword forms (a representative slice of every family) ---
  { name: "close", inputs: [pr("Close LAT-XY9Z")], expected: [{ slug: "LAT-XY9Z", action: "resolve" }] },
  { name: "closes", inputs: [pr("Closes LAT-XY9Z")], expected: [{ slug: "LAT-XY9Z", action: "resolve" }] },
  { name: "closed", inputs: [pr("Closed LAT-XY9Z")], expected: [{ slug: "LAT-XY9Z", action: "resolve" }] },
  { name: "closing", inputs: [pr("Closing LAT-XY9Z")], expected: [{ slug: "LAT-XY9Z", action: "resolve" }] },
  { name: "fix", inputs: [pr("Fix LAT-XY9Z")], expected: [{ slug: "LAT-XY9Z", action: "resolve" }] },
  { name: "fixes", inputs: [pr("Fixes LAT-XY9Z")], expected: [{ slug: "LAT-XY9Z", action: "resolve" }] },
  { name: "fixed", inputs: [pr("Fixed LAT-XY9Z")], expected: [{ slug: "LAT-XY9Z", action: "resolve" }] },
  { name: "fixing", inputs: [pr("Fixing LAT-XY9Z")], expected: [{ slug: "LAT-XY9Z", action: "resolve" }] },
  { name: "resolves", inputs: [pr("Resolves LAT-XY9Z")], expected: [{ slug: "LAT-XY9Z", action: "resolve" }] },
  { name: "resolved", inputs: [pr("Resolved LAT-XY9Z")], expected: [{ slug: "LAT-XY9Z", action: "resolve" }] },
  { name: "complete", inputs: [pr("Complete LAT-XY9Z")], expected: [{ slug: "LAT-XY9Z", action: "resolve" }] },
  { name: "implements", inputs: [pr("Implements LAT-XY9Z")], expected: [{ slug: "LAT-XY9Z", action: "resolve" }] },
  { name: "addresses", inputs: [pr("Addresses LAT-XY9Z")], expected: [{ slug: "LAT-XY9Z", action: "resolve" }] },
  { name: "solves", inputs: [pr("Solves LAT-XY9Z")], expected: [{ slug: "LAT-XY9Z", action: "resolve" }] },

  // --- unresolve keyword forms, incl. phrases ---
  { name: "reopen", inputs: [pr("Reopen LAT-XY9Z")], expected: [{ slug: "LAT-XY9Z", action: "unresolve" }] },
  { name: "reverts", inputs: [pr("Reverts LAT-XY9Z")], expected: [{ slug: "LAT-XY9Z", action: "unresolve" }] },
  {
    name: "roll back phrase",
    inputs: [pr("Roll back LAT-XY9Z")],
    expected: [{ slug: "LAT-XY9Z", action: "unresolve" }],
  },
  {
    name: "rolled back phrase",
    inputs: [commit("Rolled back LAT-XY9Z")],
    expected: [{ slug: "LAT-XY9Z", action: "unresolve" }],
  },
  { name: "back out phrase", inputs: [pr("Back out LAT-XY9Z")], expected: [{ slug: "LAT-XY9Z", action: "unresolve" }] },

  // --- reference keyword forms, incl. phrases ---
  { name: "ref", inputs: [body("Ref LAT-XY9Z")], expected: [{ slug: "LAT-XY9Z", action: "reference" }] },
  { name: "references", inputs: [body("References LAT-XY9Z")], expected: [{ slug: "LAT-XY9Z", action: "reference" }] },
  { name: "part of phrase", inputs: [body("Part of LAT-XY9Z")], expected: [{ slug: "LAT-XY9Z", action: "reference" }] },
  {
    name: "related to phrase",
    inputs: [body("Related to LAT-XY9Z")],
    expected: [{ slug: "LAT-XY9Z", action: "reference" }],
  },
  { name: "toward", inputs: [body("Toward LAT-XY9Z")], expected: [{ slug: "LAT-XY9Z", action: "reference" }] },

  // --- keyword position, case, passive voice, # prefix ---
  {
    name: "keyword after slug (passive)",
    inputs: [body("LAT-XY9Z is fixed")],
    expected: [{ slug: "LAT-XY9Z", action: "resolve" }],
  },
  {
    name: "uppercased-out lowercase input",
    inputs: [commit("fixes lat-xy9z")],
    expected: [{ slug: "LAT-XY9Z", action: "resolve" }],
  },
  { name: "screaming keyword", inputs: [pr("FIXES LAT-XY9Z")], expected: [{ slug: "LAT-XY9Z", action: "resolve" }] },
  { name: "hash-prefixed ref", inputs: [pr("Fixes #LAT-XY9Z")], expected: [{ slug: "LAT-XY9Z", action: "resolve" }] },
  { name: "colon then hash", inputs: [pr("Fixes: #LAT-XY9Z")], expected: [{ slug: "LAT-XY9Z", action: "resolve" }] },

  // --- digit-bearing prefixes: signalSlugPrefix draws from the project slug, so digits are allowed ---
  { name: "digit inside prefix", inputs: [pr("Fixes V2A-AB12")], expected: [{ slug: "V2A-AB12", action: "resolve" }] },
  {
    name: "digit-leading prefix in branch",
    inputs: [branch("fix/2fa-xy9z-retries")],
    expected: [{ slug: "2FA-XY9Z", action: "resolve" }],
  },

  // --- multiple slugs; keyword distributes over its segment ---
  {
    name: "two slugs, one keyword",
    inputs: [pr("Fixed LAT-XY9Z and LAT-AB12")],
    expected: [
      { slug: "LAT-XY9Z", action: "resolve" },
      { slug: "LAT-AB12", action: "resolve" },
    ],
  },

  // --- precedence: unresolve beats resolve in one segment ---
  {
    name: "revert of a fix classifies unresolve",
    inputs: [pr('Revert "Fix LAT-XY9Z timeouts"')],
    expected: [{ slug: "LAT-XY9Z", action: "unresolve" }],
  },

  // --- branch-name source: separators, keyword co-location ---
  {
    name: "slash branch",
    inputs: [branch("fix/lat-xy9z-timeouts")],
    expected: [{ slug: "LAT-XY9Z", action: "resolve" }],
  },
  { name: "underscore branch", inputs: [branch("fix_lat-xy9z")], expected: [{ slug: "LAT-XY9Z", action: "resolve" }] },
  {
    name: "dispatch convention branch",
    inputs: [branch("fix/lat-xy9z-timeout-handling")],
    expected: [{ slug: "LAT-XY9Z", action: "resolve" }],
  },

  // --- agent-dispatch handshake (5.16): the exact branch/title/description the default prompt emits, all resolve ---
  {
    name: "handshake branch + title + description",
    inputs: [
      branch("fix/lat-xy9z-timeout-handling"),
      pr("Resolves LAT-XY9Z: handle upstream timeouts"),
      body("Resolves LAT-XY9Z"),
    ],
    expected: [{ slug: "LAT-XY9Z", action: "resolve", sources: ["branchName", "prBody", "prTitle"] }],
  },

  // --- strongest action across sources; source provenance ---
  {
    name: "resolve title + reference body → resolve, both sources",
    inputs: [pr("Fixes LAT-XY9Z"), body("Related to LAT-XY9Z")],
    expected: [{ slug: "LAT-XY9Z", action: "resolve", sources: ["prBody", "prTitle"] }],
  },
  {
    name: "resolve title + unresolve branch → unresolve wins",
    inputs: [pr("Fixes LAT-XY9Z"), branch("revert/lat-xy9z")],
    expected: [{ slug: "LAT-XY9Z", action: "unresolve", sources: ["branchName", "prTitle"] }],
  },
  {
    name: "single source provenance",
    inputs: [commit("Fixes LAT-XY9Z")],
    expected: [{ slug: "LAT-XY9Z", action: "resolve", sources: ["commitMessage"] }],
  },

  // --- non-matches ---
  { name: "slug alone in body (keyword-less)", inputs: [body("See LAT-XY9Z for context")], expected: [] },
  { name: "keyword-less hyphenated branch", inputs: [branch("feature-lat-xy9z")], expected: [] },
  { name: "flat-xy9z is inside a word", inputs: [commit("Fixes flat-xy9z now")], expected: [] },
  { name: "year-like PRE-2024 (digit-first suffix)", inputs: [pr("Fixes PRE-2024")], expected: [] },
  {
    name: "keyword in a different sentence than slug",
    inputs: [body("This is fixed. See LAT-XY9Z later")],
    expected: [],
  },
  { name: "empty inputs", inputs: [], expected: [] },

  // --- customized keyword lists (defaults no longer apply) ---
  {
    name: "custom resolve keyword",
    inputs: [pr("Shipped LAT-XY9Z")],
    rules: { resolveKeywords: ["ship", "shipped"], unresolveKeywords: [], referenceKeywords: [] },
    expected: [{ slug: "LAT-XY9Z", action: "resolve" }],
  },
  {
    name: "default keyword ignored under custom rules",
    inputs: [pr("Fixes LAT-XY9Z")],
    rules: { resolveKeywords: ["ship"], unresolveKeywords: [], referenceKeywords: [] },
    expected: [],
  },
  {
    name: "empty rules match nothing",
    inputs: [pr("Fixes LAT-XY9Z")],
    rules: { resolveKeywords: [], unresolveKeywords: [], referenceKeywords: [] },
    expected: [],
  },
]

describe("matchTexts golden suite", () => {
  it.each(cases)("$name", ({ inputs, rules, expected }) => {
    const results = matchTexts(inputs, rules ?? DEFAULT_RULES)
    const expectedNormalized = [...expected]
      .map((match) => ({
        slug: match.slug,
        action: match.action,
        sources: match.sources ? [...match.sources].sort() : undefined,
      }))
      .sort((a, b) => a.slug.localeCompare(b.slug))

    const actual = normalize(results)
    if (expected.some((match) => match.sources === undefined)) {
      expect(actual.map(({ slug, action }) => ({ slug, action }))).toEqual(
        expectedNormalized.map(({ slug, action }) => ({ slug, action })),
      )
    } else {
      expect(actual).toEqual(expectedNormalized)
    }
  })

  it("truncates each source at the char cap before scanning", () => {
    const padded = `${"a".repeat(GITHUB_SOURCE_TEXT_MAX_CHARS)} Fixes LAT-XY9Z`
    expect(matchTexts([body(padded)], DEFAULT_RULES)).toEqual([])

    const withinCap = `Fixes LAT-XY9Z ${"a".repeat(GITHUB_SOURCE_TEXT_MAX_CHARS)}`
    expect(matchTexts([body(withinCap)], DEFAULT_RULES)).toEqual([
      { slug: "LAT-XY9Z", action: "resolve", sources: ["prBody"] },
    ])
  })
})
