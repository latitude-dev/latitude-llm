import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

type PackageJson = {
  readonly peerDependencies?: Record<string, string>
  readonly exports?: {
    readonly "."?: {
      readonly require?: {
        readonly types?: string
      }
    }
  }
}

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as PackageJson

describe("published package metadata", () => {
  it("does not publish advisory LLM SDK peer dependencies", () => {
    expect(packageJson.peerDependencies ?? {}).not.toHaveProperty("@openai/agents")
    expect(packageJson.peerDependencies ?? {}).not.toHaveProperty("typescript")
  })

  it("points CommonJS type resolution at CommonJS declarations", () => {
    expect(packageJson.exports?.["."]?.require?.types).toBe("./dist/index.d.cts")
  })
})
