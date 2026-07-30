import type { Paragraph, PhrasingContent, Root, Text } from "mdast"
import { describe, expect, it } from "vitest"
import { remarkSourceMappedBreaks } from "./remark-source-mapped-breaks.ts"

/** Mirrors what remark-parse emits for a single-paragraph document. */
function paragraphTree(source: string): Root {
  const lines = source.split(/\r\n|\r|\n/)
  const text: Text = {
    type: "text",
    value: source,
    position: {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1, offset: source.length },
    },
  }
  const paragraph: Paragraph = { type: "paragraph", children: [text] }
  return { type: "root", children: [paragraph] }
}

function run(source: string, tree: Root = paragraphTree(source)): PhrasingContent[] {
  remarkSourceMappedBreaks()(tree, source)
  const paragraph = tree.children[0]
  if (paragraph?.type !== "paragraph") throw new Error("expected a paragraph")
  return paragraph.children
}

function offsetsOf(children: readonly PhrasingContent[]): [number, number][] {
  return children
    .filter((child): child is Text => child.type === "text")
    .map((child) => [child.position?.start.offset ?? -1, child.position?.end.offset ?? -1])
}

describe("remarkSourceMappedBreaks", () => {
  it("turns a soft line break into a break node", () => {
    expect(run("line one\nline two").map((child) => child.type)).toEqual(["text", "break", "text"])
  })

  it("keeps source offsets on both sides of the break", () => {
    const source = "line one\nline two"
    expect(offsetsOf(run(source))).toEqual([
      [0, 8],
      [9, 17],
    ])
  })

  it("keeps offsets aligned across several breaks", () => {
    expect(offsetsOf(run("alpha\nbeta\ngamma"))).toEqual([
      [0, 5],
      [6, 10],
      [11, 16],
    ])
  })

  it("handles CRLF endings", () => {
    expect(offsetsOf(run("alpha\r\nbeta"))).toEqual([
      [0, 5],
      [7, 11],
    ])
  })

  it("leaves single-line text untouched", () => {
    const children = run("just one line")
    expect(children.map((child) => child.type)).toEqual(["text"])
    expect(offsetsOf(children)).toEqual([[0, 13]])
  })

  it("leaves a line unmapped when its decoded value diverges from the source", () => {
    const source = "a &amp; b\nnext"
    const tree: Root = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "text",
              value: "a & b\nnext",
              position: {
                start: { line: 1, column: 1, offset: 0 },
                end: { line: 2, column: 5, offset: source.length },
              },
            },
          ],
        },
      ],
    }

    const children = run(source, tree)
    expect(children.map((child) => child.type)).toEqual(["text", "break", "text"])
    expect(offsetsOf(children)).toEqual([
      [-1, -1],
      [10, 14],
    ])
  })

  it("still splits when the node carries no position", () => {
    const tree: Root = {
      type: "root",
      children: [{ type: "paragraph", children: [{ type: "text", value: "alpha\nbeta" }] }],
    }
    const children = run("alpha\nbeta", tree)
    expect(children.map((child) => child.type)).toEqual(["text", "break", "text"])
    expect(offsetsOf(children)).toEqual([
      [-1, -1],
      [-1, -1],
    ])
  })
})
