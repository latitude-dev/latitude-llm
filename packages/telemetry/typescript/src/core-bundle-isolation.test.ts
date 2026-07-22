import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const forbiddenImports = ["@traceloop/", "@arizeai/", "js-tiktoken", "langsmith", "@langchain/"]
const importPattern = /(?:from\s+|import\s*\()(["'])([^"']+)\1/g

function collectModuleGraph(entry: string, modules = new Map<string, string>()): Map<string, string> {
  if (modules.has(entry)) return modules

  const source = readFileSync(entry, "utf8")
  modules.set(entry, source)

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[2]
    if (!specifier?.startsWith(".")) continue
    collectModuleGraph(resolve(dirname(entry), specifier), modules)
  }

  return modules
}

describe("core bundle isolation", () => {
  it("does not reference provider instrumentation dependency graphs", () => {
    const entry = fileURLToPath(new URL("./index.ts", import.meta.url))
    const graph = collectModuleGraph(entry)
    const imports = [...graph.values()].flatMap((source) =>
      [...source.matchAll(importPattern)].map((match) => match[2] ?? ""),
    )

    expect(imports.filter((specifier) => forbiddenImports.some((prefix) => specifier.startsWith(prefix)))).toEqual([])
  })
})
