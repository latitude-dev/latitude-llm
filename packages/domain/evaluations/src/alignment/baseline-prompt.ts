import { EVALUATION_CONVERSATION_PLACEHOLDER } from "../runtime/evaluation-execution.ts"

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
    `Determine whether the conversation exhibits the described signal.`,
    `If the behavior is present, set passed to true. If the behavior is absent, set passed to false.`,
    `Provide a brief feedback explanation for your decision.`,
  ].join("\n")
