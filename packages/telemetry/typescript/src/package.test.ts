import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

type PackageJson = {
  readonly dependencies?: Record<string, string>
  readonly peerDependencies?: Record<string, string>
  readonly exports?: Record<
    string,
    {
      readonly require?: {
        readonly types?: string
      }
    }
  >
}

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as PackageJson

describe("published package metadata", () => {
  it("includes instrumentation implementations as regular dependencies", () => {
    expect(packageJson.dependencies).toHaveProperty("@traceloop/instrumentation-openai")
    expect(packageJson.dependencies).toHaveProperty("@arizeai/openinference-instrumentation-langchain")
    expect(packageJson.peerDependencies ?? {}).not.toHaveProperty("@traceloop/instrumentation-openai")
  })

  it("does not publish advisory LLM SDK peer dependencies", () => {
    expect(packageJson.peerDependencies ?? {}).not.toHaveProperty("@openai/agents")
    expect(packageJson.peerDependencies ?? {}).not.toHaveProperty("typescript")
  })

  it("points CommonJS type resolution at CommonJS declarations", () => {
    expect(packageJson.exports?.["."]?.require?.types).toBe("./dist/index.d.cts")
    expect(packageJson.exports?.["./cloudflare"]?.require?.types).toBe("./dist/cloudflare.d.cts")
    expect(packageJson.exports).not.toHaveProperty("./codemode")
  })
})
