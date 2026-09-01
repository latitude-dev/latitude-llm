/**
 * Vercel AI SDK v7 (`ai7`) + OpenAI Responses API scenarios.
 *
 * `client-tool` is the control: a tool the app executes, which `@ai-sdk/otel` traces with an
 * `execute_tool` span carrying arguments and result. Every other scenario uses a provider-executed
 * (OpenAI-hosted) tool, where the tool loop runs inside the provider and the app never executes
 * anything — so the AI SDK's tool-execution hooks never fire.
 *
 * v6 (`ai` + `@ai-sdk/openai`) cannot run in this repo: the root `@ai-sdk/provider` override makes
 * the openai provider emit a spec-v4 model that `ai@6` rejects. `examples/test_vercel_ai.ts` fails
 * the same way.
 */
import { openai } from "@ai-sdk/openai7"
import { generateText, stepCountIs, streamText, tool } from "ai7"
import { z } from "zod"

export const MODEL = process.env.OPENAI_MODEL ?? "gpt-5.5"

const MAX_TOKENS = 4000
const INSTRUCTIONS = "You are a helpful assistant. Answer in one or two short sentences."

export type ToolPart = {
  kind: "call" | "result"
  toolName: string
  toolCallId: string
  providerExecuted: boolean
  payload: unknown
}

export type ScenarioResult = {
  text: string
  /** Tool activity the AI SDK handed back to the app process, from every step's content. */
  toolParts: ToolPart[]
}

export type Scenario = {
  name: string
  description: string
  /** Returns a reason when the scenario cannot run in this environment. */
  unavailable?: () => string | undefined
  run: () => Promise<ScenarioResult>
}

type ContentPart = {
  type: string
  toolName?: string
  toolCallId?: string
  providerExecuted?: boolean
  input?: unknown
  output?: unknown
  error?: unknown
}

function collectToolParts(steps: readonly { content: readonly unknown[] }[]): ToolPart[] {
  const parts: ToolPart[] = []
  for (const step of steps) {
    for (const raw of step.content) {
      const part = raw as ContentPart
      if (part.type === "tool-call") {
        parts.push({
          kind: "call",
          toolName: part.toolName ?? "?",
          toolCallId: part.toolCallId ?? "?",
          providerExecuted: part.providerExecuted === true,
          payload: part.input,
        })
      } else if (part.type === "tool-result" || part.type === "tool-error") {
        parts.push({
          kind: "result",
          toolName: part.toolName ?? "?",
          toolCallId: part.toolCallId ?? "?",
          providerExecuted: part.providerExecuted === true,
          payload: part.type === "tool-error" ? part.error : part.output,
        })
      }
    }
  }
  return parts
}

const weatherTool = tool({
  description: "Get the current weather for a city",
  inputSchema: z.object({ city: z.string().describe("The city to get the weather for") }),
  execute: async ({ city }) => ({ city, temperatureC: 21, conditions: "sunny" }),
})

const currencyToolConfig = {
  description: "Convert an amount between two currencies",
  inputSchema: z.object({ amount: z.number(), from: z.string(), to: z.string() }),
  execute: async ({ amount, from, to }: { amount: number; from: string; to: string }) => ({
    amount,
    from,
    to,
    converted: amount * 1.08,
  }),
}

type GenerateOptions = Omit<Parameters<typeof generateText>[0], "model">

async function runGenerate(options: GenerateOptions): Promise<ScenarioResult> {
  const result = await generateText({
    model: openai(MODEL),
    instructions: INSTRUCTIONS,
    maxOutputTokens: MAX_TOKENS,
    stopWhen: stepCountIs(5),
    ...options,
  })
  return { text: result.text, toolParts: collectToolParts(result.steps) }
}

export const SCENARIOS: Scenario[] = [
  {
    name: "client-tool",
    description: "Control: app-executed tool. Emits an execute_tool span with arguments + result.",
    run: () =>
      runGenerate({
        prompt: "What's the weather in San Francisco? Use the getWeather tool, then answer.",
        tools: { getWeather: weatherTool },
      }),
  },
  {
    name: "web-search",
    description: "Provider-executed openai.tools.webSearch — runs inside the Responses API.",
    run: () =>
      runGenerate({
        prompt: "Search the web for what was announced at the latest OpenAI DevDay and summarize it.",
        tools: { web_search: openai.tools.webSearch({}) },
      }),
  },
  {
    name: "web-search-stream",
    description: "Same provider-executed web search through streamText, to cover the streaming path.",
    run: async () => {
      const result = streamText({
        model: openai(MODEL),
        instructions: INSTRUCTIONS,
        prompt: "Search the web for today's top technology headline and summarize it.",
        tools: { web_search: openai.tools.webSearch({}) },
        stopWhen: stepCountIs(5),
        maxOutputTokens: MAX_TOKENS,
      })
      for await (const _chunk of result.fullStream) {
        // Drain the stream so the AI SDK closes its spans.
      }
      return { text: await result.text, toolParts: collectToolParts(await result.steps) }
    },
  },
  {
    name: "mcp",
    description: "Provider-executed hosted MCP server (openai.tools.mcp) — the user's reported case.",
    run: () => {
      const serverUrl = process.env.MCP_SERVER_URL ?? "https://mcp.deepwiki.com/mcp"
      const serverLabel = process.env.MCP_SERVER_LABEL ?? "deepwiki"
      return runGenerate({
        prompt: `Use the ${serverLabel} MCP tools to tell me what the "vercel/ai" repository is for.`,
        tools: {
          mcp: openai.tools.mcp({
            serverLabel,
            serverUrl,
            ...(process.env.MCP_AUTHORIZATION ? { authorization: process.env.MCP_AUTHORIZATION } : {}),
          }),
        },
      })
    },
  },
  {
    name: "code-interpreter",
    description: "Provider-executed openai.tools.codeInterpreter — code in, logs out, all server-side.",
    run: () =>
      runGenerate({
        prompt: "Use the code interpreter to compute the 30th Fibonacci number, then tell me the value.",
        tools: { code_interpreter: openai.tools.codeInterpreter({}) },
      }),
  },
  {
    name: "tool-search",
    description: "Provider-executed openai.tools.toolSearch loading a deferred app tool on demand.",
    run: () =>
      runGenerate({
        prompt: "Convert 250 EUR to USD. Find the right tool first if you need to.",
        tools: {
          tool_search: openai.tools.toolSearch({}),
          convertCurrency: tool({
            ...currencyToolConfig,
            providerOptions: { openai: { deferLoading: true } },
          }),
        },
      }),
  },
  {
    name: "mixed",
    description: "One call with both a provider-executed and an app-executed tool, to contrast them in one trace.",
    run: () =>
      runGenerate({
        prompt:
          "First search the web for the current weather in Barcelona, then call getWeather for Barcelona and " +
          "compare both answers.",
        tools: { web_search: openai.tools.webSearch({}), getWeather: weatherTool },
        stopWhen: stepCountIs(6),
      }),
  },
  {
    name: "file-search",
    description: "Provider-executed openai.tools.fileSearch over a vector store.",
    unavailable: () =>
      process.env.OPENAI_VECTOR_STORE_ID ? undefined : "set OPENAI_VECTOR_STORE_ID to run this scenario",
    run: () =>
      runGenerate({
        prompt: "Search the knowledge base and summarize what it covers.",
        tools: {
          file_search: openai.tools.fileSearch({ vectorStoreIds: [process.env.OPENAI_VECTOR_STORE_ID as string] }),
        },
      }),
  },
]

export function findScenario(name: string): Scenario | undefined {
  return SCENARIOS.find((scenario) => scenario.name === name)
}
