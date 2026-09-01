import { describe, expect, it } from "vitest"
import { buildSeedAnchoredAnnotations } from "./anchored-annotations.ts"
import { TAU2_SEED_TRAJECTORIES } from "./tau2-trajectories.ts"

const annotations = buildSeedAnchoredAnnotations()
const anchored = annotations.filter((annotation) => annotation.anchor !== null)
const conversationLevel = annotations.filter((annotation) => annotation.anchor === null)

/** Mirrors the drawer: `[system, ...turns up to the last assistant turn]`. */
function anchoredTurn(annotation: (typeof annotations)[number]) {
  const trajectory = TAU2_SEED_TRAJECTORIES[annotation.trajectoryIndex]
  const messageIndex = annotation.anchor?.messageIndex
  if (!trajectory || messageIndex === undefined) return null
  const lastAssistantTurn = trajectory.messages.map((message) => message.role).lastIndexOf("assistant")
  if (messageIndex - 1 > lastAssistantTurn) return null
  return trajectory.messages[messageIndex - 1] ?? null
}

describe("buildSeedAnchoredAnnotations", () => {
  it("covers every named signal with an anchored and a conversation-level occurrence", () => {
    expect(anchored).toHaveLength(8)
    expect(conversationLevel.length).toBeGreaterThan(0)
    expect(new Set(annotations.map((annotation) => annotation.key)).size).toBe(annotations.length)
  })

  it("anchors on an assistant turn that carries text", () => {
    for (const annotation of anchored) {
      const message = anchoredTurn(annotation)
      expect(message, annotation.key).not.toBeNull()
      expect(message?.role, annotation.key).toBe("assistant")
      expect((message?.role === "assistant" ? (message.content ?? "") : "").trim(), annotation.key).not.toBe("")
    }
  })

  it("keeps anchors inside the conversation's first loaded chunk", () => {
    for (const annotation of anchored) {
      expect(annotation.anchor?.messageIndex, annotation.key).toBeLessThan(25)
    }
  })

  it("keeps substring offsets inside the anchored text part", () => {
    const substring = anchored.filter((annotation) => annotation.anchor?.startOffset !== undefined)
    expect(substring.length).toBeGreaterThan(0)

    for (const annotation of substring) {
      const message = anchoredTurn(annotation)
      const text = message?.role === "assistant" ? (message.content ?? "") : ""
      const { partIndex, startOffset = 0, endOffset = 0 } = annotation.anchor ?? {}
      expect(partIndex, annotation.key).toBe(0)
      expect(startOffset, annotation.key).toBeLessThan(endOffset)
      expect(endOffset, annotation.key).toBeLessThanOrEqual(text.length)
    }
  })

  it("puts a signal's conversation-level occurrence on a different session than its anchored one", () => {
    for (const annotation of conversationLevel) {
      const anchoredSibling = anchored.find((candidate) => candidate.signalIndex === annotation.signalIndex)
      expect(annotation.trajectoryIndex, annotation.key).not.toBe(anchoredSibling?.trajectoryIndex)
    }
  })
})
