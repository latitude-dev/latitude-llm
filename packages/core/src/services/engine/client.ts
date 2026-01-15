import { env } from '@latitude-data/env'
import { ChildProcess, spawn } from 'child_process'
import { createInterface, Interface } from 'readline'
import { z, ZodObject, ZodRawShape } from 'zod'
import { isAbortError } from '../../lib/isAbortError'
import {
  createRequest,
  createResponse,
  emptyResponseSchema,
  isRequest,
  isResponse,
  JsonRpcRequest,
  parseMessage,
  RpcErrorCode,
  serializeMessage,
} from './protocol'

type HandlerRegistration<
  P extends ZodObject<ZodRawShape>,
  R extends ZodObject<ZodRawShape>,
> = {
  paramsSchema: P
  resultSchema: R
  handler: (params: z.infer<P>) => Promise<z.infer<R>>
}

type PendingRequest<R extends ZodObject<ZodRawShape>> = {
  responseSchema: R
  resolve: (value: z.infer<R>) => void
  reject: (error: Error) => void
}

export class EngineClient {
  private process: ChildProcess | null = null
  private readline: Interface | null = null
  private handlers: Map<string, HandlerRegistration<ZodObject<ZodRawShape>, ZodObject<ZodRawShape>>> = new Map() // prettier-ignore
  private pendingRequests: Map<number | string, PendingRequest<ZodObject<ZodRawShape>>> = new Map() // prettier-ignore
  private nextId = 1
  private stderrBuffer = ''
  private abortHandler: (() => void) | null = null
  private isRunning = false

  constructor(private readonly abortSignal?: AbortSignal) {}

  /**
   * Register a handler for incoming RPC requests from Python.
   * The handler receives validated params and must return a result matching the result schema.
   */
  on<P extends ZodObject<ZodRawShape>, R extends ZodObject<ZodRawShape>>(
    method: string,
    paramsSchema: P,
    resultSchema: R,
    handler: (params: z.infer<P>) => Promise<z.infer<R>>,
  ): this {
    this.handlers.set(method, {
      paramsSchema,
      resultSchema,
      handler,
    } as unknown as HandlerRegistration<
      ZodObject<ZodRawShape>,
      ZodObject<ZodRawShape>
    >)
    return this
  }

  /**
   * Start the Python engine process.
   */
  async start(): Promise<void> {
    if (this.process) {
      throw new Error('Engine process already started')
    }

    const enginePath = env.ENGINE_PATH
    if (!enginePath) {
      throw new Error('ENGINE_PATH is not set')
    }

    const pythonExec = env.ENGINE_PYTHON
    if (!pythonExec) {
      throw new Error('ENGINE_PYTHON is not set')
    }

    this.setupAbortSignal()

    this.process = spawn(pythonExec, ['-m', 'app.main'], {
      cwd: enginePath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    })

    this.isRunning = true

    this.setupStderr()
    this.setupStdout()
    this.setupProcessEvents()
  }

  /**
   * Send an RPC request to Python and wait for the validated response.
   * @param method The RPC method name
   * @param paramsSchema Zod schema for validating the params
   * @param params The parameters (must conform to paramsSchema)
   * @param responseSchema Zod schema for validating the response (defaults to empty object)
   * @returns The validated response
   */
  async call<
    P extends ZodObject<ZodRawShape>,
    R extends ZodObject<ZodRawShape> = typeof emptyResponseSchema,
  >(
    method: string,
    paramsSchema: P,
    params: z.input<P>,
    responseSchema: R = emptyResponseSchema as R,
  ): Promise<z.output<R>> {
    if (!this.process || !this.isRunning) {
      throw new Error('Engine process is not running')
    }

    const validatedParams = paramsSchema.parse(params)

    const id = this.nextId++
    const request = createRequest(method, validatedParams, id)

    return new Promise<z.output<R>>((resolve, reject) => {
      this.pendingRequests.set(id, {
        responseSchema,
        resolve,
        reject,
      } as unknown as PendingRequest<ZodObject<ZodRawShape>>)
      this.write(serializeMessage(request))
    })
  }

  /**
   * Send an RPC notification to Python (no response expected).
   * @param method The RPC method name
   * @param paramsSchema Zod schema for validating the params
   * @param params The parameters (must conform to paramsSchema)
   */
  notify<P extends ZodObject<ZodRawShape>>(
    method: string,
    paramsSchema: P,
    params: z.input<P>,
  ): void {
    if (!this.process || !this.isRunning) return

    const validatedParams = paramsSchema.parse(params)
    const request = createRequest(method, validatedParams, null)
    this.write(serializeMessage(request))
  }

  /**
   * Stops the engine process gracefully with SIGTERM, then force kills after timeout.
   */
  async stop(): Promise<void> {
    if (this.process && !this.process.killed) {
      const proc = this.process
      proc.kill('SIGTERM')
      await Promise.race([
        new Promise<void>((resolve) => {
          proc.once('exit', () => resolve())
        }),
        new Promise<void>((resolve) => {
          setTimeout(() => resolve(), 5000)
        }),
      ])
    }

    this.cleanup()
  }

  private setupStderr(): void {
    if (!this.process?.stderr) return

    this.process.stderr.on('data', (chunk: Buffer) => {
      this.stderrBuffer += chunk.toString()
    })
  }

  private setupStdout(): void {
    if (!this.process?.stdout) return

    this.readline = createInterface({
      input: this.process.stdout,
      crlfDelay: Infinity,
    })

    this.readline.on('line', (line: string) => {
      this.handleLine(line)
    })
  }

  private setupProcessEvents(): void {
    if (!this.process) return

    this.process.on('error', (error: Error) => {
      this.isRunning = false

      this.rejectAllPending(new Error(`Engine process error: ${error.message}`))
    })

    this.process.on('exit', (code, signal) => {
      this.isRunning = false

      if (code !== 0 || this.pendingRequests.size > 0) {
        const stderr = this.stderrBuffer.trim()
        const details = stderr ? `\n${stderr}` : ''
        const error =
          signal || code
            ? `Engine process killed by a signal`
            : 'Engine process killed unexpectedly'

        this.rejectAllPending(new Error(`${error}${details}`))
      }
    })
  }

  private setupAbortSignal(): void {
    if (!this.abortSignal) return

    this.abortHandler = () => {
      this.stop()
    }

    this.abortSignal.addEventListener('abort', this.abortHandler)
  }

  private handleLine(line: string): void {
    const message = parseMessage(line)
    if (!message) return

    if (isResponse(message)) {
      this.handleResponse(message)
    } else if (isRequest(message)) {
      this.handleRequest(message).catch(() => {
        // Errors are already handled and sent as RPC responses in handleRequest
        // This catch prevents unhandled promise rejections
      })
    }
  }

  private handleResponse(response: {
    id: number | string | null
    result?: unknown
    error?: { code: number; message: string; data?: unknown }
  }): void {
    if (response.id === null) return

    const pending = this.pendingRequests.get(response.id)
    if (!pending) return

    this.pendingRequests.delete(response.id)

    if (response.error) {
      pending.reject(
        new Error(
          `RPC error ${response.error.code}: ${response.error.message}`,
        ),
      )
      return
    }

    const parseResult = pending.responseSchema.safeParse(response.result)
    if (!parseResult.success) {
      pending.reject(
        new Error(`Invalid response from Python: ${parseResult.error.message}`),
      )
      return
    }

    pending.resolve(parseResult.data)
  }

  private async handleRequest(request: JsonRpcRequest): Promise<void> {
    const registration = this.handlers.get(request.method)

    if (!registration) {
      if (request.id !== null) {
        const response = createResponse(request.id, undefined, {
          code: RpcErrorCode.METHOD_NOT_FOUND,
          message: `Method not found: ${request.method}`,
        })
        this.write(serializeMessage(response))
      }
      return
    }

    const parseResult = registration.paramsSchema.safeParse(request.params)
    if (!parseResult.success) {
      if (request.id !== null) {
        const response = createResponse(request.id, undefined, {
          code: RpcErrorCode.INVALID_PARAMS,
          message: `Invalid parameters: ${parseResult.error.message}`,
        })
        this.write(serializeMessage(response))
      }
      return
    }

    try {
      const result = await registration.handler(parseResult.data)
      if (request.id !== null) {
        const response = createResponse(request.id, result)
        this.write(serializeMessage(response))
      }
    } catch (error) {
      // Handle abort errors gracefully - don't log them as actual errors
      if (isAbortError(error)) {
        return
      }

      if (request.id !== null) {
        const response = createResponse(request.id, undefined, {
          code: RpcErrorCode.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : String(error),
        })
        this.write(serializeMessage(response))
      }
    }
  }

  private write(data: string): void {
    if (!this.process?.stdin || !this.isRunning) return
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
      this.process.kill('SIGKILL')
    }

    if (this.abortSignal && this.abortHandler) {
      this.abortSignal.removeEventListener('abort', this.abortHandler)
      this.abortHandler = null
    }

    this.readline?.close()
    this.readline = null

    this.rejectAllPending(new Error('Engine process stopped'))

    this.process = null
    this.isRunning = false
  }
}
