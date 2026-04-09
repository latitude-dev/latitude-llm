import { z } from "zod"

// TODO(eval-sandbox): when sandbox is available, the script passed here will be arbitrary JS
// instead of a fixed LLM-as-judge template. Update the system prompt to reflect that.
export const GEPA_DETAILS_GENERATOR_SYSTEM_PROMPT = `You generate concise names and descriptions for Latitude evaluation monitors.

You receive issue context and the final evaluation script. Return a short name and a plain-language description.

Rules for the name:
- A few words that describe the specific issue or behavior being tracked
- Do not include words like "Monitor", "Evaluation", "Checker", or similar suffixes
- Do not include IDs, hashes, or internal terminology

Rules for the description:
- One short paragraph in plain language
- Explain what the evaluation checks in the conversation
- Explain what counts as a pass (issue absent) and what counts as a failure (issue present)
- Do not reference implementation details, code, or internal pipeline names
- Do not include markdown fences or bullet lists`

export const gepaDetailsOutputSchema = z.object({
  name: z.string().min(1).describe("A short name describing the issue being tracked"),
  description: z
    .string()
    .min(1)
    .describe("A plain-language description of what the evaluation checks and what pass/fail means"),
})

export const buildGepaDetailsPrompt = (input: {
  readonly issueName: string
  readonly issueDescription: string
  readonly script: string
}): string =>
  [
    `Issue name: ${input.issueName}`,
    `Issue description: ${input.issueDescription}`,
    "",
    "Final evaluation script:",
    input.script,
    "",
    "Return a concise name and a plain-language description per the rules above.",
  ].join("\n\n")
