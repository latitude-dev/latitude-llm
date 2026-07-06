import { describe, expect, it } from "vitest"
import type { TransformContext } from "../transform.ts"
import { transformOtlpToSpans } from "../transform.ts"
import type { OtlpExportTraceServiceRequest, OtlpKeyValue } from "../types.ts"

function str(key: string, value: string): OtlpKeyValue {
  return { key, value: { stringValue: value } }
}

const TRACE_ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const SPAN_STT = "bbbbbbbbbbbbbbbb"
const SPAN_TTS = "cccccccccccccccc"
const PROJECT_ID = "pppppppppppppppppppppppp"
const ORG_ID = "oooooooooooooooooooooooo"

const context: TransformContext = {
  organizationId: ORG_ID,
  apiKeyId: "test-key",
  ingestedAt: new Date("2026-01-01T00:00:00.000Z"),
  defaultProjectId: PROJECT_ID,
  projectIdBySlug: new Map(),
}

const request: OtlpExportTraceServiceRequest = {
  resourceSpans: [
    {
      resource: { attributes: [str("service.name", "voice-qa")] },
      scopeSpans: [
        {
          scope: { name: "voice-qa", version: "1.0.0" },
          spans: [
            {
              traceId: TRACE_ID,
              spanId: SPAN_STT,
              name: "transcribe whisper-1",
              startTimeUnixNano: "1000000000",
              endTimeUnixNano: "2000000000",
              attributes: [
                str("gen_ai.operation.name", "transcribe"),
                str("gen_ai.request.model", "whisper-1"),
                str("gen_ai.input.audio.uri", "https://www.w3schools.com/html/horse.mp3"),
                str("gen_ai.output.text", "hello from speech"),
              ],
            },
            {
              traceId: TRACE_ID,
              spanId: SPAN_TTS,
              name: "speech tts-1",
              startTimeUnixNano: "3000000000",
              endTimeUnixNano: "4000000000",
              attributes: [
                str("gen_ai.operation.name", "speech"),
                str("gen_ai.request.model", "tts-1"),
                str("gen_ai.input.text", "It's sunny today."),
                str("gen_ai.output.audio.uri", "https://www.w3schools.com/html/horse.mp3"),
              ],
            },
          ],
        },
      ],
    },
  ],
}

describe("transformOtlpToSpans (voice QA)", () => {
  it("maps STT/TTS attrs to span messages with audio parts", () => {
    const { spans, rejectedSpans } = transformOtlpToSpans(request, context)
    expect(rejectedSpans).toBe(0)
    expect(spans).toHaveLength(2)

    const stt = spans.find((s) => s.spanId === SPAN_STT)
    const tts = spans.find((s) => s.spanId === SPAN_TTS)

    expect(stt?.operation).toBe("transcribe")
    expect(stt?.inputMessages[0]?.parts).toEqual([
      { type: "uri", modality: "audio", uri: "https://www.w3schools.com/html/horse.mp3" },
    ])
    expect(stt?.outputMessages[0]?.parts).toEqual([{ type: "text", content: "hello from speech" }])

    expect(tts?.operation).toBe("speech")
    expect(tts?.inputMessages[0]?.parts).toEqual([{ type: "text", content: "It's sunny today." }])
    expect(tts?.outputMessages[0]?.parts).toEqual([
      { type: "uri", modality: "audio", uri: "https://www.w3schools.com/html/horse.mp3" },
    ])
  })
})
