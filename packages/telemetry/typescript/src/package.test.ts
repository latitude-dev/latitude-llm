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

const instrumentationDependencies = [
  "@arizeai/openinference-instrumentation-langchain",
  "@traceloop/instrumentation-anthropic",
  "@traceloop/instrumentation-bedrock",
  "@traceloop/instrumentation-cohere",
  "@traceloop/instrumentation-llamaindex",
  "@traceloop/instrumentation-openai",
  "@traceloop/instrumentation-together",
  "@traceloop/instrumentation-vertexai",
] as const

describe("published package metadata", () => {
  it("includes instrumentation implementations as regular dependencies", () => {
    for (const dependency of instrumentationDependencies) {
      expect(packageJson.dependencies).toHaveProperty(dependency)
      expect(packageJson.peerDependencies ?? {}).not.toHaveProperty(dependency)
    }
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
