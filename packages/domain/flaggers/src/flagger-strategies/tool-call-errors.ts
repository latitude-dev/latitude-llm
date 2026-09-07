import type { FlaggerConversation } from "../conversation.ts"
import type { FlaggerFinding, FlaggerFindingDraft } from "../entities/flagger-finding.ts"
import {
  buildMessageFlaggerFindingRead,
  collectToolCallErrorFindings,
  detectToolCallErrorsFlagger,
  type ToolCallErrorFinding,
} from "../helpers.ts"
import type { DetectionResult, FlaggerStrategy } from "./types.ts"

type ToolCallErrorFindingDraft = Extract<FlaggerFindingDraft, { readonly flaggerSlug: "tool-call-errors" }>

const toFindingDraft = (finding: ToolCallErrorFinding): ToolCallErrorFindingDraft => {
  const base = {
    flaggerSlug: "tool-call-errors" as const,
    feedback: finding.feedback,
    messageIndex: finding.messageIndex,
    partIndex: finding.partIndex,
  }

  switch (finding.kind) {
    case "malformed":
      return {
        ...base,
        findingKind: finding.kind,
        ...(finding.toolName ? { toolName: finding.toolName } : {}),
        ...(finding.toolCallId ? { toolCallId: finding.toolCallId } : {}),
      }
    case "duplicate":
    case "undeclared":
      if (!finding.toolName || !finding.toolCallId) throw new Error(`Invalid ${finding.kind} tool finding`)
      return {
        ...base,
        findingKind: finding.kind,
        toolName: finding.toolName,
        toolCallId: finding.toolCallId,
      }
    case "unknown-id":
      return {
        ...base,
        findingKind: finding.kind,
        ...(finding.toolCallId ? { toolCallId: finding.toolCallId } : {}),
      }
    case "error":
      if (!finding.toolName || !finding.toolCallId || finding.responseMessageIndex === undefined) {
        throw new Error("Invalid tool error finding")
      }
      return {
        ...base,
        findingKind: finding.kind,
        toolName: finding.toolName,
        toolCallId: finding.toolCallId,
        responseMessageIndex: finding.responseMessageIndex,
        ...(finding.responsePartIndex !== undefined ? { responsePartIndex: finding.responsePartIndex } : {}),
        ...(finding.recovered !== undefined ? { recovered: finding.recovered } : {}),
        ...(finding.sameSubjectRecovered !== undefined ? { sameSubjectRecovered: finding.sameSubjectRecovered } : {}),
      }
  }
}

const selectDiscoveryFinding = (findings: readonly FlaggerFinding[]): FlaggerFinding | null =>
  findings.find(
    (finding) =>
      finding.flaggerSlug === "tool-call-errors" && (finding.findingKind !== "error" || finding.recovered !== true),
  ) ?? null

/**
 * Deterministic-only strategy. Inspects tool-call / tool-response pairs in the
 * trace's messages and flags traces that emit malformed, duplicate, or
 * explicitly-failed tool responses. Never calls an LLM.
 */
export const toolCallErrorsStrategy: FlaggerStrategy = {
  details: {
    name: "Tool call errors",
    description: "Flags malformed, duplicate, or explicitly failed tool responses without calling an LLM.",
  },

  hasRequiredContext(conversation: FlaggerConversation): boolean {
    return conversation.allMessages.length > 0
  },

  detectDeterministically(conversation: FlaggerConversation): DetectionResult {
    const result = detectToolCallErrorsFlagger(conversation)
    return result.matched
      ? { kind: "matched", feedback: result.feedback, messageIndex: result.messageIndex }
      : { kind: "unmatched" }
  },

  readDeterministically({ scope, conversation }) {
    return buildMessageFlaggerFindingRead({
      scope,
      conversation,
      findings: collectToolCallErrorFindings(conversation).map((finding) => ({
        finding: toFindingDraft(finding),
        ...(finding.toolCallId
          ? {
              sourceAnchor:
                finding.kind === "unknown-id"
                  ? `tool-response:${finding.toolCallId}`
                  : `tool-call:${finding.toolCallId}`,
            }
          : {}),
      })),
    })
  },

  selectDeterministicDiscoveryFinding: selectDiscoveryFinding,
}
