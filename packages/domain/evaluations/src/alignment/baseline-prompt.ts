import { EVALUATION_CONVERSATION_PLACEHOLDER } from "../codegen/judge-script-template.ts"

// Single source of the present-verdict convention: passed = true when the behavior is present.
const PRESENT_VERDICT_INSTRUCTION = [
  `Determine whether the conversation exhibits the described behavior.`,
  `If the behavior is present, set passed to true. If it is absent, set passed to false.`,
  `Provide a brief feedback explanation for your decision.`,
]

export const generateBaselinePromptText = (signalName: string, signalDescription: string): string =>
  [
    `You are evaluating a conversation for the following signal.`,
    ``,
    `Signal: ${signalName}`,
    `Description: ${signalDescription}`,
    ``,
    `Conversation:`,
    EVALUATION_CONVERSATION_PLACEHOLDER,
    ``,
    ...PRESENT_VERDICT_INSTRUCTION,
  ].join("\n")

// Judge prompt compiled from a user-authored `criteria` (the EvaluationSettings judge form).
// Same wrapper + present-verdict convention as the discovery baseline, so generated judges run
// and align identically regardless of authoring path.
export const generateJudgePromptText = (criteria: string): string =>
  [
    `You are evaluating a conversation against the following criteria.`,
    ``,
    `Criteria: ${criteria}`,
    ``,
    `Conversation:`,
    EVALUATION_CONVERSATION_PLACEHOLDER,
    ``,
    ...PRESENT_VERDICT_INSTRUCTION,
  ].join("\n")
