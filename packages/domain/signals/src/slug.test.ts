import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { generateSignalSlug, SignalSlugGenerationError, signalSlugPrefix } from "./slug.ts"

describe("signalSlugPrefix", () => {
  it("uppercases the first three non-hyphen characters", () => {
    expect(signalSlugPrefix("lat-demo")).toBe("LAT")
    expect(signalSlugPrefix("my-cool-project")).toBe("MYC")
    expect(signalSlugPrefix("acme-signals")).toBe("ACM")
  })

  it("pads slugs shorter than three characters with random letters", () => {
    const short = signalSlugPrefix("ab")
    expect(short).toHaveLength(3)
    expect(short.startsWith("AB")).toBe(true)
    expect(short).toMatch(/^AB[A-Z]$/)

    const single = signalSlugPrefix("x")
    expect(single).toHaveLength(3)
    expect(single).toMatch(/^X[A-Z]{2}$/)
  })
})

describe("generateSignalSlug", () => {
  const run = <A, E>(effect: Effect.Effect<A, E, never>) => Effect.runPromise(effect)

  it("produces a PREFIX-XXXX slug when the first candidate is free", async () => {
    const slug = await run(generateSignalSlug({ projectSlug: "acme-signals", count: () => Effect.succeed(0) }))
    expect(slug).toMatch(/^ACM-[A-Z0-9]{4}$/)
  })

  it("redraws the suffix until a free candidate is found", async () => {
    const seen: string[] = []
    let calls = 0
    const slug = await run(
      generateSignalSlug({
        projectSlug: "acme-signals",
        count: (candidate) =>
          Effect.sync(() => {
            seen.push(candidate)
            calls += 1
            return calls < 3 ? 1 : 0
          }),
      }),
    )
    expect(calls).toBe(3)
    expect(slug).toBe(seen[2])
    expect(new Set(seen).size).toBe(3)
    expect(slug).toMatch(/^ACM-[A-Z0-9]{4}$/)
  })

  it("fails when no free slug can be found", async () => {
    const result = await Effect.runPromise(
      generateSignalSlug({ projectSlug: "acme-signals", count: () => Effect.succeed(1) }).pipe(Effect.flip),
    )
    expect(result).toBeInstanceOf(SignalSlugGenerationError)
  })
})
