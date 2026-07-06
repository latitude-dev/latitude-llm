import { generateId, generateText, type ModelMessage } from "ai"
import type { createCodeTool } from "@cloudflare/codemode/ai"
import type { createWorkersAI } from "workers-ai-provider"
import { extractCodemodeCode } from "./codemode-code"

type CodemodeTool = ReturnType<typeof createCodeTool>
type WorkersModel = ReturnType<ReturnType<typeof createWorkersAI>>

const PLAN_TIMEOUT_MS = 90_000

function withTimeout<T>(promise: Promise<T>, label: string) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${PLAN_TIMEOUT_MS / 1000}s`)), PLAN_TIMEOUT_MS)
    }),
  ])
}

export async function runCodemodePlan(options: {
  model: WorkersModel
  codemode: CodemodeTool
  modelMessages: ModelMessage[]
  abortSignal?: AbortSignal
  experimental_telemetry?: Parameters<typeof generateText>[0]["experimental_telemetry"]
}) {
  const plan = await withTimeout(
    generateText({
      model: options.model,
      system:
        "Write one JavaScript async arrow function that solves the user's request using codemode.* tools. " +
        "For city comparisons: call delegateWeatherResearch({ cities: ['Barcelona', 'Paris'], focus: '...' }), " +
        "then formatTravelBrief({ headline, cities: research.cities, researchSummary: research.summary }). " +
        "delegateWeatherResearch returns { ok, summary, cities } — use research.cities, not the input city names. " +
        "Return only the async arrow function — no markdown fences, no prose.",
      messages: options.modelMessages,
      tools: { codemode: options.codemode },
      toolChoice: { type: "tool", toolName: "codemode" },
      abortSignal: options.abortSignal,
      experimental_telemetry: options.experimental_telemetry,
    }),
    "Workers AI codemode plan",
  )

  if (plan.toolCalls.length > 0) {
    return [...options.modelMessages, ...plan.response.messages] as ModelMessage[]
  }

  const code = extractCodemodeCode(plan.text)
  if (!code) {
    throw new Error("Model did not produce executable codemode output")
  }

  const toolCallId = generateId()
  const execute = options.codemode.execute
  if (!execute) {
    throw new Error("codemode tool is missing execute")
  }

  const output = await execute(
    { code },
    {
      toolCallId,
      messages: options.modelMessages,
      abortSignal: options.abortSignal,
    },
  )

  return [
    ...options.modelMessages,
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId,
          toolName: "codemode",
          input: { code },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId,
          toolName: "codemode",
          output,
        },
      ],
    },
  ] as ModelMessage[]
}
