import { describe, expect, it } from "vitest"
import { greet } from "./greet.ts"

describe("greet activity", () => {
  it("returns a greeting", async () => {
    await expect(greet("Latitude")).resolves.toBe("Hello, Latitude!")
  })
})
