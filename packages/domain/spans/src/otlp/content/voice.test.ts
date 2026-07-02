import { describe, expect, it } from "vitest"
import type { OtlpKeyValue } from "../types.ts"
import { parseContent } from "./index.ts"

function str(key: string, value: string): OtlpKeyValue {
  return { key, value: { stringValue: value } }
}

describe("parseContent (voice)", () => {
  it("maps transcribe output text to an assistant message", () => {
    const result = parseContent([str("gen_ai.operation.name", "transcribe"), str("gen_ai.output.text", "hello world")])

    expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "hello world" }] }])
    expect(result.inputMessages).toEqual([])
  })

  it("maps speech input text to a user message", () => {
    const result = parseContent([str("gen_ai.operation.name", "speech"), str("gen_ai.input.text", "It's sunny today.")])

    expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "It's sunny today." }] }])
    expect(result.outputMessages).toEqual([])
  })

  it("attaches input audio uri on transcribe spans", () => {
    const result = parseContent([
      str("gen_ai.operation.name", "transcribe"),
      str("gen_ai.input.audio.uri", "https://example.com/input.wav"),
      str("gen_ai.output.text", "hello"),
    ])

    expect(result.inputMessages).toEqual([
      {
        role: "user",
        parts: [{ type: "uri", modality: "audio", uri: "https://example.com/input.wav" }],
      },
    ])
    expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "hello" }] }])
  })

  it("attaches output audio blob on speech spans with mime from output format", () => {
    const result = parseContent([
      str("gen_ai.operation.name", "speech"),
      str("gen_ai.input.text", "Hi"),
      str("gen_ai.output.audio", "aGVsbG8="),
      str("openai.agents.audio.output_format", "mp3"),
    ])

    expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "Hi" }] }])
    expect(result.outputMessages).toEqual([
      {
        role: "assistant",
        parts: [{ type: "blob", modality: "audio", content: "aGVsbG8=", mime_type: "audio/mpeg" }],
      },
    ])
  })

  it("maps LiveKit lk.user_transcript and lk.input_text", () => {
    const stt = parseContent([str("gen_ai.operation.name", "transcribe"), str("lk.user_transcript", "spoken question")])
    expect(stt.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "spoken question" }] }])

    const tts = parseContent([str("gen_ai.operation.name", "speech"), str("lk.input_text", "reply text")])
    expect(tts.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "reply text" }] }])
  })

  it("defers to gen_ai.input.messages when both text and messages are present", () => {
    const messages = [{ role: "user", parts: [{ type: "text", content: "from messages" }] }]
    const result = parseContent([
      str("gen_ai.input.messages", JSON.stringify(messages)),
      str("gen_ai.input.text", "ignored"),
    ])

    expect(result.inputMessages).toEqual(messages)
  })
})
