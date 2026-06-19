import type { OptimizationTrajectory } from "@domain/optimizations"
import { z } from "zod"

const formatTrajectory = (trajectory: OptimizationTrajectory, index: number): string => {
  const lines = [
    `Trajectory ${index + 1}`,
    `Expected behavior present: ${trajectory.expectedPositive}`,
    `Predicted behavior present: ${trajectory.predictedPositive}`,
    `Passed: ${trajectory.passed}`,
    `Score: ${trajectory.score}`,
    "Conversation:",
    trajectory.conversationText,
    "Evaluator feedback:",
    trajectory.feedback || "No feedback captured.",
  ]

  if (trajectory.annotationContext) {
    lines.push("Human annotation context (ground truth reasoning from the annotator):", trajectory.annotationContext)
  }

  return lines.join("\n")
}

// TODO(eval-sandbox): when sandbox is available, relax the MVP template constraint and
// allow arbitrary JS evaluation scripts instead of the fixed LLM-as-judge wrapper.
export const GEPA_PROPOSER_SYSTEM_PROMPT = `You improve Latitude evaluation scripts used in an MVP LLM-as-judge runtime.

You receive:
- a signal name and description
- the current evaluation script
- sanitized execution trajectories from examples where the candidate succeeded or failed

Each trajectory may include "Human annotation context" — this is ground truth reasoning from the human annotator explaining *why* the example does or does not exhibit the signal. When a trajectory is WRONG (prediction != expected), pay close attention to the annotation context: it reveals the specific distinction the current script fails to capture.

Return reasoning and a full improved evaluation script per the schema.

Rules for the script:
- The script field must contain the entire evaluation script, with no markdown fences
- Preserve the current MVP script wrapper exactly: one llm() call that returns { passed: boolean, feedback: string }, followed by the existing Passed/Failed return logic
- Only change the prompt text inside the llm() template literal
- The prompt MUST instruct the model to set passed to true when the signal's behavior is PRESENT in the conversation (an occurrence), and false when it is ABSENT
- The only allowed interpolation placeholder inside the prompt text is \${conversation} — it will be replaced at runtime with the formatted conversation
- Do not use backticks inside the prompt text
- Keep the prompt text focused on detecting whether the target signal's behavior is present in the conversation
- Learn from failures in the trajectories — especially use the human annotation context to understand the precise boundary between an occurrence (present) and a non-occurrence (absent)
- Prefer small, concrete improvements over complete rewrites`

export const gepaProposalOutputSchema = z.object({
  reasoning: z.string().min(1),
  script: z.string().min(1).describe("A complete evaluation script body matching the MVP LLM-as-judge template"),
})

export const buildGepaProposalPrompt = (input: {
  readonly signalName: string
  readonly signalDescription: string
  readonly currentScript: string
  readonly trajectories: readonly OptimizationTrajectory[]
}): string =>
  [
    `Signal name: ${input.signalName}`,
    `Signal description: ${input.signalDescription}`,
    "",
    "Current evaluation script:",
    input.currentScript,
    "",
    "Trajectories:",
    ...(input.trajectories.length > 0
      ? input.trajectories.map((trajectory, index) => formatTrajectory(trajectory, index))
      : ["No prior trajectories are available. Make a conservative improvement to the current script."]),
    "",
    "Return reasoning and script per the schema.",
  ].join("\n\n")
