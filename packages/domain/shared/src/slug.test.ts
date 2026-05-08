import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { generateSlug, SLUG_MAX_LENGTH } from "./slug.ts"

const counts =
  (taken: ReadonlyMap<string, number>) =>
  (slug: string): Effect.Effect<number, never> =>
    Effect.succeed(taken.get(slug) ?? 0)

describe("SLUG_MAX_LENGTH", () => {
  it("is the agreed-on system-wide cap", () => {
    expect(SLUG_MAX_LENGTH).toBe(128)
  })
})

describe("generateSlug", () => {
  it("returns the trimmed base slug when count is omitted", async () => {
    const result = await Effect.runPromise(generateSlug({ name: "Hello World" }))
    expect(result).toBe("hello-world")
  })

  it("returns the base slug when count reports 0", async () => {
    const result = await Effect.runPromise(
      generateSlug({
        name: "Hello World",
        count: counts(new Map()),
      }),
    )
    expect(result).toBe("hello-world")
  })

  it("appends a 4-char random url-safe suffix on first collision", async () => {
    const result = await Effect.runPromise(
      generateSlug({
        name: "Hello World",
        count: counts(new Map([["hello-world", 1]])),
      }),
    )
    expect(result).toMatch(/^hello-world-[a-z0-9]{4}$/)
  })

  it("falls back to random+count when even the random suffix collides", async () => {
    // Force determinism by claiming every random4 is taken with count=1. Then
    // the second retry must succeed because the count-suffixed slug is novel.
    const taken = new Map<string, number>([["hello-world", 1]])
    // Match any 4-char suffix → return 1.
    const customCounts = (slug: string): Effect.Effect<number, never> => {
      if (slug === "hello-world") return Effect.succeed(1)
      if (/^hello-world-[a-z0-9]{4}$/.test(slug)) return Effect.succeed(1)
      return Effect.succeed(taken.get(slug) ?? 0)
    }

    const result = await Effect.runPromise(generateSlug({ name: "Hello World", count: customCounts }))
    expect(result).toMatch(/^hello-world-[a-z0-9]{4}1$/)
  })

  it("caps the produced slug at SLUG_MAX_LENGTH", async () => {
    const longName = "a".repeat(500)
    const result = await Effect.runPromise(generateSlug({ name: longName }))
    expect(result.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH)
    expect(result).toBe("a".repeat(SLUG_MAX_LENGTH))
  })

  it("reserves room for the suffix when colliding near SLUG_MAX_LENGTH", async () => {
    const longName = "a".repeat(SLUG_MAX_LENGTH + 50)
    const baseAtCap = "a".repeat(SLUG_MAX_LENGTH)
    const result = await Effect.runPromise(
      generateSlug({
        name: longName,
        count: counts(new Map([[baseAtCap, 1]])),
      }),
    )
    // 4-char random suffix + leading hyphen = 5 chars; result still ≤ cap.
    expect(result.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH)
    expect(result).toMatch(/^a+-[a-z0-9]{4}$/)
  })

  it("strips trailing hyphens after slicing", async () => {
    // Slicing "this-is-a-very-very-long-name..." to e.g. 10 chars leaves a
    // dangling "-"; the generator must trim it.
    const result = await Effect.runPromise(generateSlug({ name: "this is a very very long name that exceeds" }))
    expect(result.endsWith("-")).toBe(false)
  })

  it("fails with InvalidSlugInputError when the input has no url-safe chars", async () => {
    const program = generateSlug({ name: "!!!@@@", count: counts(new Map()) }).pipe(
      Effect.catchTag("InvalidSlugInputError", (e) => Effect.succeed(e._tag)),
    )
    expect(await Effect.runPromise(program)).toBe("InvalidSlugInputError")
  })

  it("propagates errors from the count callback", async () => {
    class BoomError {
      readonly _tag = "BoomError"
    }
    const failingCount = (_slug: string): Effect.Effect<number, BoomError> => Effect.fail(new BoomError())

    const exit = await Effect.runPromiseExit(generateSlug({ name: "Anything", count: failingCount }))
    expect(exit._tag).toBe("Failure")
  })
})
