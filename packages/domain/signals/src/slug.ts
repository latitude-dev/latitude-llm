import { init } from "@paralleldrive/cuid2"
import { Data, Effect } from "effect"

/**
 * Human-facing signal slug: a JIRA-style `LAT-XY9Z` reference — a three-char
 * uppercase project prefix, a hyphen, then a four-char uppercased cuid. Assigned
 * once at creation and never regenerated, so it is the signal's stable, URL-safe
 * public identifier.
 */
const PREFIX_LENGTH = 3
const SUFFIX_LENGTH = 4

/**
 * Defensive cap on suffix redraws. Each attempt draws a fresh 4-char cuid
 * (~1.2M values) and checks it against the org-wide namespace (D15), so a real
 * collision past the first attempt is astronomically unlikely; the cap only
 * stops a misbehaving `count` callback from looping forever.
 */
const MAX_ATTEMPTS = 10

const createSuffix = init({ length: SUFFIX_LENGTH })

const PAD_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

const randomPadChar = () => PAD_ALPHABET[Math.floor(Math.random() * PAD_ALPHABET.length)]

/**
 * Three-char uppercase prefix from a project slug: its first three non-hyphen
 * characters, right-padded with random letters when the slug has fewer than
 * three.
 */
export const signalSlugPrefix = (projectSlug: string): string => {
  let prefix = projectSlug.replace(/-/g, "").slice(0, PREFIX_LENGTH).toUpperCase()
  while (prefix.length < PREFIX_LENGTH) prefix += randomPadChar()
  return prefix
}

export class SignalSlugGenerationError extends Data.TaggedError("SignalSlugGenerationError")<{
  readonly reason: string
}> {}

interface GenerateSignalSlugInput<E, R> {
  /** Slug of the owning project; supplies the uppercase prefix. */
  readonly projectSlug: string
  /**
   * Uniqueness check: receives a candidate slug and returns the number of
   * existing rows already using it (0 when free). Pairs with
   * `SignalRepository.countBySlug`, which counts org-wide (D15).
   */
  readonly count: (slug: string) => Effect.Effect<number, E, R>
}

/**
 * Generate a unique {@link signalSlugPrefix}-prefixed signal slug, redrawing the
 * cuid suffix until `count` reports the candidate is free.
 */
export const generateSignalSlug = Effect.fn("signals.generateSignalSlug")(function* <E, R>(
  args: GenerateSignalSlugInput<E, R>,
) {
  const prefix = signalSlugPrefix(args.projectSlug)
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = `${prefix}-${createSuffix().toUpperCase()}`
    if ((yield* args.count(candidate)) === 0) return candidate
  }
  return yield* new SignalSlugGenerationError({
    reason: `Could not generate a unique signal slug after ${MAX_ATTEMPTS} attempts`,
  })
})
