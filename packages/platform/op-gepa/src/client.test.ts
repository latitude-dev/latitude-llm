import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it, vi } from "vitest"
import { resolveGepaProcessOptions } from "./client.ts"

const tempDirs: string[] = []

const createTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "op-gepa-"))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  vi.unstubAllEnvs()

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      rmSync(dir, { force: true, recursive: true })
    }
  }
})

describe("resolveGepaProcessOptions", () => {
  it("uses the package python root instead of process.cwd()", () => {
    const previousCwd = process.cwd()
    const tempCwd = createTempDir()

    process.chdir(tempCwd)

    try {
      const options = resolveGepaProcessOptions()
      expect(options.pythonRoot).toBe(fileURLToPath(new URL("../python", import.meta.url)))
    } finally {
      process.chdir(previousCwd)
    }
  })

  it("prefers a repo-local venv python when present under the configured root", () => {
    const pythonRoot = createTempDir()
    const pythonExecutable = join(pythonRoot, ".venv", "bin", "python")
    mkdirSync(join(pythonRoot, ".venv", "bin"), { recursive: true })
    writeFileSync(pythonExecutable, "")

    vi.stubEnv("LAT_GEPA_PYTHON_ROOT", pythonRoot)

    const options = resolveGepaProcessOptions()

    expect(options.pythonRoot).toBe(pythonRoot)
    expect(options.pythonExecutable).toBe(pythonExecutable)
  })

  it("respects an explicit python executable override", () => {
    const pythonRoot = createTempDir()
    const pythonExecutable = join(pythonRoot, "custom-python")

    vi.stubEnv("LAT_GEPA_PYTHON_ROOT", pythonRoot)
    vi.stubEnv("LAT_GEPA_PYTHON_EXECUTABLE", pythonExecutable)

    const options = resolveGepaProcessOptions()

    expect(options.pythonRoot).toBe(pythonRoot)
    expect(options.pythonExecutable).toBe(pythonExecutable)
  })
})
