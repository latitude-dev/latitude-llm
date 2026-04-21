import type { TraceDetail } from "@domain/spans"
import type { QueueStrategy } from "./types.ts"

// ---------------------------------------------------------------------------
// Default Strategy for queues without custom implementations
// ---------------------------------------------------------------------------

const DEFAULT_SYSTEM_PROMPT_TEMPLATE = `
You are a triage flagger for LLM telemetry traces. Decide whether the trace belongs in a single annotation queue for human review.

Queue name: {{queueName}}
Queue description: {{queueDescription}}

Queue instructions:
{{queueInstructions}}

Rules:
- Return matched=true only when the trace clearly belongs in this queue.
- If uncertain, return matched=false.
- Base your decision only on the provided trace summary.
- Return no explanation outside the structured output.
`.trim()

interface QueueDefinition {
  name: string
  description: string
  instructions: string
}

const DEFAULT_QUEUE_DEFINITIONS: Record<string, QueueDefinition> = {
  forgetting: {
    name: "Forgetting",
    description: "The assistant forgets earlier conversation context or instructions",
    instructions:
      "Use this queue when the assistant loses relevant session memory, repeats already-settled questions, contradicts previously established facts, or ignores earlier constraints/preferences from the same conversation. Do not use it for ambiguity that was never resolved or context that the user never provided.",
  },
  trashing: {
    name: "Trashing",
    description: "The agent cycles between tools without making progress",
    instructions:
      "Use this queue when the agent repeatedly invokes the same tools or tool sequences, oscillates between states, or accumulates tool calls without advancing toward the goal. Do not use this queue for legitimate retries after transient errors or for iterative refinement that is visibly converging.",
  },
}

export function createDefaultStrategy(_queueSlug: string, definition: QueueDefinition): QueueStrategy {
  return {
    hasRequiredContext(trace: TraceDetail): boolean {
      return trace.allMessages.length > 0
    },

    buildSystemPrompt(): string {
      return DEFAULT_SYSTEM_PROMPT_TEMPLATE.replace("{{queueName}}", definition.name)
        .replace("{{queueDescription}}", definition.description)
        .replace("{{queueInstructions}}", definition.instructions)
    },

    buildPrompt(trace: TraceDetail): string {
      // Simple conversation excerpt for default queues
      const messages = trace.allMessages.slice(-8)
      const formatted = messages
        .map((m) => {
          const text = m.parts
            .filter((p) => p.type === "text")
            .map((p) => (p as { content?: string }).content || "")
            .join(" ")
          return `${m.role}: ${text}`
        })
        .join("\n")

      return `CONVERSATION:\n${formatted}`
    },
  }
}

export { DEFAULT_QUEUE_DEFINITIONS }

// Note: QueueDefinition type is intentionally not exported to keep API surface minimal
