import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { GepaClient, resolveGepaProcessOptions } from "./client.ts"
import {
  JsonRpcErrorCode,
  type JsonRpcRequest,
  type JsonRpcResponse,
  JsonRpcResponseError,
  parseMessage,
} from "./protocol.ts"

const tempDirs: string[] = []

const createTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "op-gepa-"))
  tempDirs.push(dir)
  return dir
}

class TestAIError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AIError"
  }
}

class TestActivityError extends Error {
  readonly _tag = "EvaluationAlignmentActivityError"
  readonly httpStatus = 500
  readonly httpMessage = 'Evaluation alignment activity "optimizeEvaluationDraft" failed'

  constructor(cause: unknown) {
    super("")
    this.name = "EvaluationAlignmentActivityError"
    this.cause = cause
  }
}

type InternalClient = {
  on: GepaClient["on"]
  handleRequest: (request: JsonRpcRequest) => Promise<void>
  handleResponse: (response: JsonRpcResponse) => void
  write: (data: string) => void
  pendingRequests: Map<
    number | string,
    {
      readonly method: string
      readonly responseSchema: z.ZodType
      readonly resolve: (value: unknown) => void
      readonly reject: (error: Error) => void
    }
  >
}

const asInternalClient = (client: GepaClient): InternalClient => client as unknown as InternalClient

afterEach(() => {
  vi.restoreAllMocks()
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

describe("GepaClient RPC errors", () => {
  it("serializes handler failures with a meaningful RPC message and nested data", async () => {
    const client = asInternalClient(new GepaClient())
    const paramsSchema = z.object({ id: z.string() })
    const resultSchema = z.object({ ok: z.boolean() })
    let written = ""

    client.on("gepa_evaluate", paramsSchema, resultSchema, async () => {
      throw new TestActivityError(new TestAIError("Bedrock is unable to process your request."))
    })
    client.write = (data: string) => {
      written = data
    }

    await client.handleRequest({
      jsonrpc: "2.0",
      method: "gepa_evaluate",
      params: { id: "example-1" },
      id: 1,
    })

    const response = parseMessage(written.trim())
    if (!response || !("error" in response) || !response.error) {
      throw new Error("Expected JSON-RPC error response")
    }

    expect(response.error).toMatchObject({
      code: JsonRpcErrorCode.internalError,
      message:
        'Evaluation alignment activity "optimizeEvaluationDraft" failed: Bedrock is unable to process your request.',
      data: {
        type: "TestActivityError",
        httpMessage: 'Evaluation alignment activity "optimizeEvaluationDraft" failed',
        cause: {
          type: "TestAIError",
          message: "Bedrock is unable to process your request.",
        },
      },
    })
  })

  it("preserves RPC error data when the Python server responds with an error", async () => {
    const client = asInternalClient(new GepaClient())

    const rejection = new Promise<never>((_resolve, reject) => {
      client.pendingRequests.set(1, {
        method: "gepa_optimize",
        responseSchema: z.object({}),
        resolve: () => {
          throw new Error("Expected promise rejection")
        },
        reject,
      })
    })

    client.handleResponse({
      jsonrpc: "2.0",
      id: 1,
      error: {
        code: JsonRpcErrorCode.internalError,
        message: "Evaluation alignment activity failed",
        data: {
          remoteError: {
            message: "Bedrock is unable to process your request.",
          },
        },
      },
    })

    await expect(rejection).rejects.toBeInstanceOf(JsonRpcResponseError)
    await expect(rejection).rejects.toMatchObject({
      message: "RPC error -32603: Evaluation alignment activity failed",
      code: JsonRpcErrorCode.internalError,
      method: "gepa_optimize",
      requestId: 1,
      data: {
        remoteError: {
          message: "Bedrock is unable to process your request.",
        },
      },
    })
  })
})
