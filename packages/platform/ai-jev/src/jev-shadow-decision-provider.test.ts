import { JevShadowDecisionProvider } from "@domain/flaggers"
import { Effect, Fiber, type Layer } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  createJevShadowDecisionProvider,
  JevShadowDecisionProviderLive,
  JevShadowDecisionProviderUnconfigured,
} from "./jev-shadow-decision-provider.ts"

const apiKey = "jev-secret-key"

const input = {
  question: { id: "frustration", version: "v1", prompt: "Is the user frustrated?" },
  state: {
    conversation: {
      allMessages: [],
      outputMessages: [],
      systemInstructions: [],
      tags: [],
      tokensInput: 0,
      tokensCacheRead: 0,
      tokensCacheCreate: 0,
    },
  },
}

const response = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const successBody = (answers: Record<string, unknown> = { frustration: { type: "noul", noul: 0.8 } }) => ({
  answers,
  usage: { input_tokens: 12, output_tokens: 3 },
  model: "jev-2026-09-15",
})

const decide = (
  fetch: typeof globalThis.fetch,
  options: Partial<Parameters<typeof createJevShadowDecisionProvider>[0]> = {},
) => Effect.runPromise(createJevShadowDecisionProvider({ apiKey, fetch, ...options }).decide(input))

const decideWithLayer = (layer: Layer.Layer<JevShadowDecisionProvider, unknown, never>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const provider = yield* JevShadowDecisionProvider
      return yield* provider.decide(input)
    }).pipe(Effect.provide(layer)),
  )

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("Jev shadow decision provider", () => {
  it("posts the TypeSafe System One request and maps a noul answer", async () => {
    let request: RequestInit | undefined
    let url: string | undefined
    const fetch: typeof globalThis.fetch = async (requestUrl, init) => {
      url = String(requestUrl)
      request = init
      return response(successBody())
    }

    await expect(decide(fetch)).resolves.toMatchObject({
      kind: "success",
      probability: 0.8,
      provider: "typesafe-ai",
      requestedModel: "jev-latest",
      resolvedModel: "jev-2026-09-15",
      inputTokens: 12,
      outputTokens: 3,
    })
    expect(url).toBe("https://api.typesafe.ai/v1/systemone")
    expect(request?.method).toBe("POST")
    expect(request?.headers).toMatchObject({ Authorization: `Bearer ${apiKey}` })
    expect(JSON.parse(request?.body as string)).toEqual({
      state: input.state,
      model: "jev-latest",
      questions: { frustration: { type: "noul", instructions: "Is the user frustrated?" } },
    })
  })

  it("maps the answer with the requested question id", async () => {
    const fetch: typeof globalThis.fetch = async () =>
      response(successBody({ unrelated: { type: "noul", noul: 0.1 }, frustration: { type: "noul", noul: 0.6 } }))

    await expect(decide(fetch)).resolves.toMatchObject({ kind: "success", probability: 0.6 })
  })

  it("maps timeout aborts to timeout", async () => {
    let aborted = false
    const fetch: typeof globalThis.fetch = async (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          aborted = true
          reject(new DOMException("Timed out", "AbortError"))
        })
      })

    await expect(decide(fetch, { timeoutMs: 1 })).resolves.toMatchObject({ kind: "failure", errorCategory: "timeout" })
    expect(aborted).toBe(true)
  })

  it.each([
    [401, "authentication"],
    [403, "authentication"],
    [429, "rate-limit"],
    [422, "provider"],
    [500, "provider"],
    [529, "provider"],
  ] as const)("maps HTTP %i to %s without reading its body", async (status, errorCategory) => {
    const fetch: typeof globalThis.fetch = async () => response({ error: apiKey }, status)

    await expect(decide(fetch)).resolves.toMatchObject({ kind: "failure", errorCategory })
  })

  it.each([
    ["invalid JSON", () => new Response("{", { status: 200 })],
    ["missing named answer", () => response(successBody({ unrelated: { type: "noul", noul: 0.1 } }))],
    ["invalid noul probability", () => response(successBody({ frustration: { type: "noul", noul: 2 } }))],
    ["invalid response shape", () => response({ answers: [] })],
  ] as const)("maps %s to malformed-response without credential leakage", async (_name, makeResponse) => {
    const fetch: typeof globalThis.fetch = async () => makeResponse()

    const result = await decide(fetch)
    expect(result).toMatchObject({ kind: "failure", errorCategory: "malformed-response" })
    expect(JSON.stringify(result)).not.toContain(apiKey)
  })

  it("maps network failures to provider without credential leakage", async () => {
    const fetch: typeof globalThis.fetch = async () => Promise.reject(new Error(`connection failed for ${apiKey}`))

    const result = await decide(fetch)
    expect(result).toMatchObject({ kind: "failure", errorCategory: "provider" })
    expect(JSON.stringify(result)).not.toContain(apiKey)
  })

  it("maps synchronous provider failures to provider", async () => {
    const fetch: typeof globalThis.fetch = () => {
      throw new Error("connection failed")
    }

    await expect(decide(fetch)).resolves.toMatchObject({ kind: "failure", errorCategory: "provider" })
  })

  it("maps synchronous AbortSignal failures to provider", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
      throw new RangeError("invalid timeout")
    })
    const fetch = vi.fn()

    await expect(decide(fetch)).resolves.toMatchObject({ kind: "failure", errorCategory: "provider" })
    expect(timeout).toHaveBeenCalledOnce()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("maps body-read aborts to timeout", async () => {
    let signal: AbortSignal | undefined
    const fetch: typeof globalThis.fetch = async (_url, init) => {
      signal = init?.signal as AbortSignal
      return {
        ok: true,
        json: () =>
          new Promise((_resolve, reject) => {
            if (signal?.aborted) {
              reject(signal.reason)
              return
            }
            const bodyRead = setTimeout(() => reject(new Error("body read did not abort")), 50)
            signal?.addEventListener(
              "abort",
              () => {
                clearTimeout(bodyRead)
                reject(signal?.reason)
              },
              { once: true },
            )
          }),
      } as Response
    }

    await expect(decide(fetch, { timeoutMs: 1 })).resolves.toMatchObject({ kind: "failure", errorCategory: "timeout" })
  })

  it("aborts the request while reading a response body when interrupted", async () => {
    let signal: AbortSignal | undefined
    let bodyReadStarted: (() => void) | undefined
    const bodyReadStartedPromise = new Promise<void>((resolve) => {
      bodyReadStarted = resolve
    })
    const fetch: typeof globalThis.fetch = async (_url, init) => {
      signal = init?.signal as AbortSignal
      return {
        ok: true,
        json: () =>
          new Promise((_resolve, reject) => {
            bodyReadStarted?.()
            signal?.addEventListener("abort", () => reject(signal?.reason), { once: true })
          }),
      } as Response
    }
    const provider = createJevShadowDecisionProvider({ apiKey, fetch })
    const fiber = Effect.runFork(provider.decide(input))

    await bodyReadStartedPromise
    await Effect.runPromise(Fiber.interrupt(fiber))

    expect(signal?.aborted).toBe(true)
  })

  it("provides a safe authentication failure from the unconfigured layer", async () => {
    await expect(decideWithLayer(JevShadowDecisionProviderUnconfigured)).resolves.toMatchObject({
      kind: "failure",
      errorCategory: "authentication",
    })
  })

  it("uses the safe unconfigured provider when LAT_JEV_API_KEY is absent", async () => {
    vi.stubEnv("LAT_JEV_API_KEY", "")
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)

    await expect(decideWithLayer(JevShadowDecisionProviderLive)).resolves.toMatchObject({
      kind: "failure",
      errorCategory: "authentication",
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    "not-a-number",
    "0",
    "1.5",
    "Infinity",
    "4294967296",
  ])("falls back from invalid timeout config %s", async (timeoutMs) => {
    vi.stubEnv("LAT_JEV_API_KEY", apiKey)
    vi.stubEnv("LAT_JEV_TIMEOUT_MS", timeoutMs)
    vi.stubGlobal("fetch", async () => response(successBody()))

    await expect(decideWithLayer(JevShadowDecisionProviderLive)).resolves.toMatchObject({
      kind: "success",
      probability: 0.8,
    })
  })
})
