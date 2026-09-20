import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { createJevClassifier } from "./jev-classifier.ts"

const response = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const input = {
  state: { conversation: [{ role: "user", content: "Please get me a person" }] },
  instructions: "How should this request be routed?",
  criteria: {
    human: "The user requests a human agent",
    assistant: "The assistant can continue",
  },
}

describe("Jev classifier", () => {
  it("sends a Choice question and returns all option probabilities", async () => {
    let requestUrl: string | URL | Request | undefined
    let request: RequestInit | undefined
    const fetch: typeof globalThis.fetch = async (url, init) => {
      requestUrl = url
      request = init
      return response({
        model: "jev-1.13",
        answers: {
          classification: {
            type: "choice",
            choice: "human",
            probabilities: { human: 0.9, assistant: 0.1 },
            confidence: 0.8,
          },
        },
        usage: { input_tokens: 10, output_tokens: 2 },
      })
    }

    const result = await Effect.runPromise(
      createJevClassifier({ apiKey: "secret", baseUrl: "https://api.typesafe.ai///", fetch }).classify(input),
    )

    expect(requestUrl).toBe("https://api.typesafe.ai/v1/systemone")
    expect(JSON.parse(request?.body as string)).toEqual({
      state: input.state,
      model: "jev-latest",
      questions: {
        classification: { type: "choice", instructions: input.instructions, criteria: input.criteria },
      },
    })
    expect(result).toMatchObject({
      probabilities: { human: 0.9, assistant: 0.1 },
      tokens: 12,
      cost: 42,
      servedBy: { provider: "typesafe-ai", model: "jev-1.13" },
    })
  })

  it("fails when Jev omits a requested option", async () => {
    const fetch: typeof globalThis.fetch = async () =>
      response({
        model: "jev-1.13",
        answers: {
          classification: {
            type: "choice",
            choice: "human",
            probabilities: { human: 1 },
            confidence: 1,
          },
        },
        usage: { input_tokens: 10, output_tokens: 2 },
      })

    await expect(Effect.runPromise(createJevClassifier({ apiKey: "secret", fetch }).classify(input))).rejects.toThrow(
      "omitted an option",
    )
  })
})
