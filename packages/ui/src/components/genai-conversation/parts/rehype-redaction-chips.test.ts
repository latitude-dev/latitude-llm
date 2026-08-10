import { describe, expect, it } from "vitest"
import { REDACTION_CHIP_LABEL_ATTR, REDACTION_CHIP_TAG, rehypeRedactionChips } from "./rehype-redaction-chips.ts"
import type { HastNode } from "./source-mapped-text-plugin.ts"

/** Attacher then transformer, matching how unified invokes a plugin. */
const run = (tree: HastNode): HastNode => {
  rehypeRedactionChips()(tree)
  return tree
}

const text = (value: string, startOffset = 0): HastNode => ({
  type: "text",
  value,
  position: { start: { offset: startOffset }, end: { offset: startOffset + value.length } },
})

const paragraph = (...children: HastNode[]): HastNode => ({
  type: "element",
  tagName: "p",
  properties: {},
  children,
})

const chipsOf = (node: HastNode): HastNode[] =>
  (node.children ?? []).filter((child) => child.tagName === REDACTION_CHIP_TAG)

const labelsOf = (node: HastNode): unknown[] =>
  chipsOf(node).map((chip) => chip.properties?.[REDACTION_CHIP_LABEL_ATTR])

const textsOf = (node: HastNode): (string | undefined)[] =>
  (node.children ?? []).filter((child) => child.type === "text").map((child) => child.value)

describe("rehypeRedactionChips", () => {
  it("replaces a placeholder mid-sentence, keeping the text either side", () => {
    const tree = run(paragraph(text("Email ada@ was [REDACTED_EMAIL] before storage.")))

    expect(labelsOf(tree)).toEqual(["EMAIL"])
    expect(textsOf(tree)).toEqual(["Email ada@ was ", " before storage."])
  })

  it("handles a placeholder at offset 0", () => {
    const tree = run(paragraph(text("[REDACTED_PHONE] called twice.")))

    expect(labelsOf(tree)).toEqual(["PHONE"])
    expect(textsOf(tree)).toEqual([" called twice."])
    expect(tree.children?.[0]?.tagName).toBe(REDACTION_CHIP_TAG)
  })

  it("handles a placeholder at end of string", () => {
    const tree = run(paragraph(text("Card on file: [REDACTED_CREDIT_CARD]")))

    expect(labelsOf(tree)).toEqual(["CREDIT_CARD"])
    expect(textsOf(tree)).toEqual(["Card on file: "])
  })

  it("replaces several placeholders in one text node", () => {
    const tree = run(paragraph(text("[REDACTED_EMAIL] and [REDACTED_US_SSN] and [REDACTED_IBAN]")))

    expect(labelsOf(tree)).toEqual(["EMAIL", "US_SSN", "IBAN"])
    expect(textsOf(tree)).toEqual([" and ", " and "])
  })

  it("handles adjacent placeholders with nothing between them", () => {
    const tree = run(paragraph(text("[REDACTED_EMAIL][REDACTED_PHONE]")))

    expect(labelsOf(tree)).toEqual(["EMAIL", "PHONE"])
    expect(textsOf(tree)).toEqual([])
  })

  // `segmentForHighlights` slices by subtracting the source origin, so a wrong offset here
  // lands search highlights on the wrong characters with no error anywhere.
  it("assigns source offsets that still address the original string", () => {
    const original = "before [REDACTED_EMAIL] after"
    const tree = run(paragraph(text(original)))

    const fragments = (tree.children ?? []).filter((child) => child.type === "text")
    for (const fragment of fragments) {
      const start = fragment.position?.start?.offset
      const end = fragment.position?.end?.offset
      expect(start).toBeDefined()
      expect(end).toBeDefined()
      expect(original.slice(start, end)).toBe(fragment.value)
    }
  })

  it("shifts offsets by the original node's start, not by zero", () => {
    const tree = run(paragraph(text("xx [REDACTED_EMAIL]", 100)))

    const [first] = (tree.children ?? []).filter((child) => child.type === "text")
    expect(first?.position?.start?.offset).toBe(100)
    expect(first?.position?.end?.offset).toBe(103)
  })

  // Position-less chips are what keep a placeholder out of selection and search mapping.
  it("gives the chip no position of its own", () => {
    const tree = run(paragraph(text("a [REDACTED_EMAIL] b")))

    expect(chipsOf(tree)[0]?.position).toBeUndefined()
  })

  it("leaves text without a position unpositioned rather than inventing offsets", () => {
    const tree = run(paragraph({ type: "text", value: "a [REDACTED_EMAIL] b" }))

    const fragments = (tree.children ?? []).filter((child) => child.type === "text")
    expect(fragments).toHaveLength(2)
    for (const fragment of fragments) expect(fragment.position).toBeUndefined()
  })

  it("leaves a bare [REDACTED] alone, since it carries no label", () => {
    const tree = run(paragraph(text("value was [REDACTED] here")))

    expect(chipsOf(tree)).toHaveLength(0)
    expect(textsOf(tree)).toEqual(["value was [REDACTED] here"])
  })

  it("ignores lowercase and mixed-case lookalikes", () => {
    const tree = run(paragraph(text("[redacted_email] [Redacted_Email]")))

    expect(chipsOf(tree)).toHaveLength(0)
  })

  it("leaves text untouched when there is no placeholder", () => {
    const node = text("nothing to see")
    const tree = run(paragraph(node))

    expect(tree.children?.[0]).toBe(node)
  })

  it("does not chip inside a code element", () => {
    const tree = run({
      type: "element",
      tagName: "code",
      properties: {},
      children: [text('{"email":"[REDACTED_EMAIL]"}')],
    })

    expect(chipsOf(tree)).toHaveLength(0)
    expect(textsOf(tree)).toEqual(['{"email":"[REDACTED_EMAIL]"}'])
  })

  it("does not chip nested inside a code element either", () => {
    const inner: HastNode = {
      type: "element",
      tagName: "span",
      properties: { className: ["hljs-string"] },
      children: [text("[REDACTED_EMAIL]")],
    }
    run({
      type: "element",
      tagName: "pre",
      properties: {},
      children: [{ type: "element", tagName: "code", properties: {}, children: [inner] }],
    })

    expect(chipsOf(inner)).toHaveLength(0)
  })

  it("still chips prose in a sibling of a code block", () => {
    const prose = paragraph(text("see [REDACTED_EMAIL]"))
    run({
      type: "root",
      children: [{ type: "element", tagName: "code", properties: {}, children: [text("[REDACTED_PHONE]")] }, prose],
    })

    expect(labelsOf(prose)).toEqual(["EMAIL"])
  })

  it("descends into nested prose elements", () => {
    const emphasis = paragraph(text("[REDACTED_SECRET]"))
    emphasis.tagName = "em"
    run(paragraph(emphasis))

    expect(labelsOf(emphasis)).toEqual(["SECRET"])
  })
})
