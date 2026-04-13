import { EVALUATION_CONVERSATION_PLACEHOLDER } from "../runtime/evaluation-execution.ts"

export const generateBaselinePromptText = (issueName: string, issueDescription: string): string =>
  [
    `You are evaluating a conversation for the following issue.`,
    ``,
    `Issue: ${issueName}`,
    `Description: ${issueDescription}`,
    ``,
    `Conversation:`,
    EVALUATION_CONVERSATION_PLACEHOLDER,
    ``,
    `Determine whether the conversation exhibits the described issue.`,
    `If the issue is present, set passed to false. If the issue is absent, set passed to true.`,
    `Provide a brief feedback explanation for your decision.`,
  ].join("\n")
