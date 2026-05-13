import { Data, Effect } from "effect"

/**
 * Single source of truth for the maximum length of a user-derived slug across
 * the whole system. Keep all entity slug columns at least this wide; the
 * generator never produces a string longer than this.
 *
 * Flagger slugs are exempt — those are typed enum values from a fixed
 * registry, not derived from user input. See `@domain/flaggers`.
 */
export const SLUG_MAX_LENGTH = 128

/**
 * Soft cap on the input length we feed into the slug regexes. Prevents a
 * caller from triggering an O(n) scan over megabyte-sized strings. Sized at
 * `SLUG_MAX_LENGTH * 1.5` so that names with runs of non-alphanumeric chars
 * (which collapse to a single `-` and shrink the result) still have enough
 * raw input to fill the final cap.
 */
const SLUG_INPUT_MAX_LENGTH = Math.ceil(SLUG_MAX_LENGTH * 1.5)

/**
 * Normalize `value` into a URL-safe slug capped at {@link SLUG_MAX_LENGTH}:
 * trim, lowercase, bound to {@link SLUG_INPUT_MAX_LENGTH} before running any
 * regex, replace non-alphanumeric runs with `-`, drop leading and trailing
 * hyphens, slice to the cap, and strip any trailing hyphen the slice may
 * have left behind.
 *
 * This is the canonical slug shape every consumer should use. Pair with
 * {@link generateSlug} when the entity has a uniqueness constraint and you
 * need collision-resolution; pair with a direct equality check (e.g.
 * "did this rename actually change the slug?") otherwise. May return an
 * empty string for inputs with no URL-safe chars.
 */
export const toSlug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .slice(0, SLUG_INPUT_MAX_LENGTH)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, "")

/**
 * Hard upper bound on retry attempts inside {@link generateSlug}. The
 * algorithm is designed so this is essentially unreachable (random suffix +
 * count-based fallback give astronomical uniqueness), but the cap is here as
 * a defensive safety net so a misbehaving `exists` callback can't lock the
 * generator into an infinite loop.
 */
const MAX_ATTEMPTS = 100

const RANDOM_SUFFIX_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789"
const RANDOM_SUFFIX_LENGTH = 4

export class InvalidSlugInputError extends Data.TaggedError("InvalidSlugInputError")<{
  readonly name: string
  readonly reason: string
}> {}

const randomSuffix = () => {
  let s = ""
  for (let i = 0; i < RANDOM_SUFFIX_LENGTH; i++) {
    s += RANDOM_SUFFIX_CHARS[Math.floor(Math.random() * RANDOM_SUFFIX_CHARS.length)]
  }
  return s
}

const trimHyphens = (s: string) => s.replace(/-+$/g, "")

/**
 * Slice `base` and append `suffix` while keeping the result ≤ {@link SLUG_MAX_LENGTH}.
 * Trailing hyphens left after slicing are stripped before joining so we never
 * produce "foo--abcd"-style slugs.
 */
const truncateAndJoin = (base: string, suffix: string): string => {
  const room = Math.max(1, SLUG_MAX_LENGTH - suffix.length)
  return `${trimHyphens(base.slice(0, room))}${suffix}`
}

export interface GenerateSlugInput<E, R> {
  /** Source string the slug is derived from — typically the entity's display name. */
  readonly name: string
  /**
   * Optional uniqueness check. Receives a candidate slug and returns the
   * number of existing rows that already use it (0 when free, ≥1 when taken).
   * Pairs naturally with each entity repository's `countBySlug(...)` method.
   * When omitted, the generator just returns the trimmed base slug — useful
   * for entities that don't have a uniqueness constraint, or for callers that
   * want to do the existence check themselves.
   */
  readonly count?: (slug: string) => Effect.Effect<number, E, R>
}

/**
 * Derive a URL-safe slug from `name`, capped at {@link SLUG_MAX_LENGTH}, and
 * (when a `count` callback is provided) make it unique by appending a 4-char
 * random suffix on collision, plus the existing-row count if even the random
 * suffix happens to collide.
 *
 * Algorithm:
 *
 * 1. Normalize `name` to a base slug via {@link toSlug}, trim trailing hyphens
 *    after slicing to {@link SLUG_MAX_LENGTH}.
 * 2. If no `count` callback is provided, return the base slug.
 * 3. Call `count(base)`. If it reports `0`, return the base slug.
 * 4. Append `-{4 random url-safe lowercase chars}` to the base. Truncate the
 *    base further if needed so the joined string still fits.
 * 5. Call `count(candidate)`. If `0`, return it.
 * 6. Otherwise append the existing-row count after the random chars and
 *    return that. The random suffix gives ~1.7M combinations even before the
 *    count fallback, so a real collision past step 5 is extraordinarily
 *    unlikely; the count fallback is a deterministic safety net for tests
 *    and pathological data.
 *
 * No max-attempt error is thrown in practice — the algorithm always terminates
 * within a handful of `count` calls. The defensive `MAX_ATTEMPTS` cap exists
 * solely to prevent an infinite loop if the callback misbehaves.
 */
export const generateSlug = Effect.fn("shared.generateSlug")(function* <E, R>(args: GenerateSlugInput<E, R>) {
  const baseSlug = toSlug(args.name)
  if (baseSlug.length === 0) {
    return yield* new InvalidSlugInputError({
      name: args.name,
      reason: "Input does not produce any URL-safe characters",
    })
  }

  if (!args.count) return baseSlug

  const baseCount = yield* args.count(baseSlug)
  if (baseCount === 0) return baseSlug

  // First retry: append a random 4-char url-safe suffix. With 36^4 ≈ 1.7M
  // combinations the probability of collision against a per-(org, project)
  // namespace is effectively zero; we still check `count` once to be safe.
  let attempts = 1
  let random = randomSuffix()
  let candidate = truncateAndJoin(baseSlug, `-${random}`)
  const candidateCount = yield* args.count(candidate)
  if (candidateCount === 0) return candidate

  // Second retry: append the existing-row count after the random chars. The
  // count is always non-zero here so the new candidate is structurally
  // different from anything checked above.
  candidate = truncateAndJoin(baseSlug, `-${random}${candidateCount}`)
  attempts++
  if ((yield* args.count(candidate)) === 0) return candidate

  // Defensive loop: keep regenerating fresh randoms with a counter prefix
  // until we find a free slot. In practice the loop never runs past the
  // first iteration; the cap is purely so a misbehaving `count` (e.g. one
  // that always returns >0) can't hang the generator.
  while (attempts < MAX_ATTEMPTS) {
    random = randomSuffix()
    candidate = truncateAndJoin(baseSlug, `-${random}${attempts}`)
    if ((yield* args.count(candidate)) === 0) return candidate
    attempts++
  }

  return yield* new InvalidSlugInputError({
    name: args.name,
    reason:
      `Could not generate a unique slug after ${MAX_ATTEMPTS} attempts — ` +
      "either the existence check is misbehaving or the namespace is exhausted",
  })
})
