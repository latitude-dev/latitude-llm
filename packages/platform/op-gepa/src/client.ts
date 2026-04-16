import { type ChildProcess, spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { createInterface, type Interface } from "node:readline"
import { fileURLToPath } from "node:url"
import { parseEnvOptional } from "@platform/env"
import { Effect } from "effect"
import type { ZodType, z } from "zod"
import { GEPA_DEFAULT_SEED, GEPA_PYTHON_ENTRY_MODULE } from "./constants.ts"
import {
  createInternalErrorResponse,
  createJsonRpcResponseError,
  createRequest,
  createResponse,
  isRequest,
  isResponse,
  JsonRpcErrorCode,
  type JsonRpcRequest,
  type JsonRpcResponse,
  parseMessage,
  serializeMessage,
} from "./protocol.ts"

type HandlerRegistration<P extends ZodType, R extends ZodType> = {
  readonly paramsSchema: P
  readonly resultSchema: R
  readonly handler: (params: z.infer<P>) => Promise<z.infer<R>>
}

type PendingRequest<R extends ZodType> = {
  readonly method: string
  readonly responseSchema: R
  readonly resolve: (value: z.infer<R>) => void
  readonly reject: (error: Error) => void
}

export interface GepaProcessOptions {
  readonly pythonExecutable: string
  readonly pythonRoot: string
  readonly entryModule: string
  readonly env: NodeJS.ProcessEnv
}

const defaultPythonRoot = fileURLToPath(new URL("../python", import.meta.url))

const resolveDefaultPythonExecutable = (pythonRoot: string): string => {
  const localCandidates =
    process.platform === "win32"
      ? [resolve(pythonRoot, ".venv", "Scripts", "python.exe"), resolve(pythonRoot, ".venv", "Scripts", "python3.exe")]
      : [resolve(pythonRoot, ".venv", "bin", "python"), resolve(pythonRoot, ".venv", "bin", "python3")]

  return localCandidates.find((candidate) => existsSync(candidate)) ?? "python3"
}

export const resolveGepaProcessOptions = (): GepaProcessOptions => {
  const pythonRoot = Effect.runSync(parseEnvOptional("LAT_GEPA_PYTHON_ROOT", "string")) ?? defaultPythonRoot
  const pythonExecutable =
    Effect.runSync(parseEnvOptional("LAT_GEPA_PYTHON_EXECUTABLE", "string")) ??
    resolveDefaultPythonExecutable(pythonRoot)
  const seed = Effect.runSync(parseEnvOptional("LAT_GEPA_SEED", "number")) ?? GEPA_DEFAULT_SEED

  return {
    pythonExecutable,
    pythonRoot,
    entryModule: GEPA_PYTHON_ENTRY_MODULE,
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
      LAT_GEPA_SEED: String(seed),
    },
  }
}

export class GepaClient {
  private process: ChildProcess | null = null
  private readline: Interface | null = null
  private handlers = new Map<string, HandlerRegistration<ZodType, ZodType>>()
  private pendingRequests = new Map<number | string, PendingRequest<ZodType>>()
  private nextId = 1
  private stderrBuffer = ""
  private abortHandler: (() => void) | null = null
  private isRunning = false

  constructor(
    private readonly options: {
      readonly abortSignal?: AbortSignal
      readonly processOptions?: GepaProcessOptions
    } = {},
  ) {}

  /**
   * Register a handler for incoming JSON-RPC requests from Python.
   * The handler receives validated params and must return a result matching the result schema.
   */
  on<P extends ZodType, R extends ZodType>(
    method: string,
    paramsSchema: P,
    resultSchema: R,
    handler: (params: z.infer<P>) => Promise<z.infer<R>>,
  ): this {
    this.handlers.set(method, {
      paramsSchema,
      resultSchema,
      handler,
    } as HandlerRegistration<ZodType, ZodType>)

    return this
  }

  /**
   * Start the GEPA process.
   */
  async start(): Promise<void> {
    if (this.process) {
      throw new Error("GEPA process already started")
    }

    const processOptions = this.options.processOptions ?? resolveGepaProcessOptions()

    this.setupAbortSignal()

    this.process = spawn(processOptions.pythonExecutable, ["-m", processOptions.entryModule], {
      cwd: processOptions.pythonRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env: processOptions.env,
    })

    this.isRunning = true

    this.setupStderr()
    this.setupStdout()
    this.setupProcessEvents()
  }

  /**
   * Send a JSON-RPC request to GEPA and wait for the validated response.
   * @param method The method name
   * @param paramsSchema Zod schema for validating the params
   * @param params The parameters (must conform to paramsSchema)
   * @param responseSchema Zod schema for validating the response (defaults to empty object)
   * @returns The validated response
   */
  async call<P extends ZodType, R extends ZodType>(
    method: string,
    paramsSchema: P,
    params: z.input<P>,
    responseSchema: R,
  ): Promise<z.output<R>> {
    if (!this.process || !this.isRunning) {
      throw new Error("GEPA process is not running")
    }

    const validatedParams = paramsSchema.parse(params)
    const id = this.nextId++
    const request = createRequest(method, validatedParams as Record<string, unknown>, id)

    return new Promise<z.output<R>>((resolve, reject) => {
      this.pendingRequests.set(id, {
        method,
        responseSchema,
        resolve,
        reject,
      } as PendingRequest<ZodType>)

      this.write(serializeMessage(request))
    })
  }

  async stop(): Promise<void> {
    if (this.process && !this.process.killed) {
      const process = this.process
      process.kill("SIGTERM")

      await Promise.race([
        new Promise<void>((resolve) => {
          process.once("exit", () => resolve())
        }),
        new Promise<void>((resolve) => {
          setTimeout(resolve, 5_000)
        }),
      ])
    }

    this.cleanup()
  }

  private setupStderr(): void {
    this.process?.stderr?.on("data", (chunk: Buffer) => {
      this.stderrBuffer += chunk.toString()
    })
  }

  private setupStdout(): void {
    if (!this.process?.stdout) {
      return
    }

    this.readline = createInterface({
      input: this.process.stdout,
      crlfDelay: Number.POSITIVE_INFINITY,
    })

    this.readline.on("line", (line: string) => {
      this.handleLine(line)
    })
  }

  private setupProcessEvents(): void {
    if (!this.process) {
      return
    }

    this.process.on("error", (error: Error) => {
      this.isRunning = false
      this.rejectAllPending(new Error(`GEPA process error: ${error.message}`))
    })

    this.process.on("exit", (code, signal) => {
      this.isRunning = false

      if (code !== 0 || this.pendingRequests.size > 0) {
        const stderr = this.stderrBuffer.trim()
        const details = stderr.length > 0 ? `\n${stderr}` : ""
        const error = signal || code ? `GEPA process killed by a signal` : "GEPA process killed unexpectedly"
        this.rejectAllPending(new Error(`${error}${details}`))
      }
    })
  }

  private setupAbortSignal(): void {
    const abortSignal = this.options.abortSignal
    if (!abortSignal) {
      return
    }

    this.abortHandler = () => {
      void this.stop()
    }

    abortSignal.addEventListener("abort", this.abortHandler)
  }

  private handleLine(line: string): void {
    const message = parseMessage(line)
    if (!message) {
      return
    }

    if (isResponse(message)) {
      this.handleResponse(message)
    } else if (isRequest(message)) {
      this.handleRequest(message).catch(() => {
        // Errors are already handled and sent as RPC responses in handleRequest
        // This catch prevents unhandled promise rejections
      })
    }
  }

  private handleResponse(response: JsonRpcResponse): void {
    if (response.id === null) {
      return
    }

    const pending = this.pendingRequests.get(response.id)
    if (!pending) {
      return
    }

    this.pendingRequests.delete(response.id)

    if (response.error) {
      pending.reject(
        createJsonRpcResponseError({
          error: response.error,
          method: pending.method,
          requestId: response.id,
        }),
      )
      return
    }

    const parseResult = pending.responseSchema.safeParse(response.result)
    if (!parseResult.success) {
      pending.reject(new Error(`Invalid response from GEPA process: ${parseResult.error.message}`))
      return
    }

    pending.resolve(parseResult.data)
  }

  private async handleRequest(request: JsonRpcRequest): Promise<void> {
    const registration = this.handlers.get(request.method)
    if (!registration) {
      if (request.id !== null) {
        this.write(
          serializeMessage(
            createResponse(request.id, undefined, {
              code: JsonRpcErrorCode.methodNotFound,
              message: `Method not found: ${request.method}`,
            }),
          ),
        )
      }
      return
    }

    const parseParams = registration.paramsSchema.safeParse(request.params)
    if (!parseParams.success) {
      if (request.id !== null) {
        this.write(
          serializeMessage(
            createResponse(request.id, undefined, {
              code: JsonRpcErrorCode.invalidParams,
              message: `Invalid parameters: ${parseParams.error.message}`,
            }),
          ),
        )
      }
      return
    }

    try {
      const result = await registration.handler(parseParams.data)
      if (request.id !== null) {
        this.write(serializeMessage(createResponse(request.id, result)))
      }
    } catch (error) {
      if (request.id !== null) {
        this.write(serializeMessage(createInternalErrorResponse(request.id, error)))
      }
    }
  }

  private write(data: string): void {
    if (!this.process?.stdin || !this.isRunning) {
      return
    }

    this.process.stdin.write(data)
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error)
    }

    this.pendingRequests.clear()
  }

  private cleanup(): void {
    if (this.process && !this.process.killed) {
      this.process.kill("SIGKILL")
    }

    if (this.options.abortSignal && this.abortHandler) {
      this.options.abortSignal.removeEventListener("abort", this.abortHandler)
      this.abortHandler = null
    }

    this.readline?.close()
    this.readline = null

    this.rejectAllPending(new Error("GEPA process stopped"))

    this.process = null
    this.isRunning = false
  }
}
