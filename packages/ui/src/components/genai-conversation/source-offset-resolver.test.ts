import { describe, expect, it } from "vitest"
import { findIndices } from "./source-offset-resolver.ts"

// findIndices reads `Node.TEXT_NODE` to detect whether it was handed a text
// node. Stub the constant so the test runs in the default node environment
// without pulling in jsdom.
if (typeof globalThis.Node === "undefined") {
  ;(globalThis as unknown as { Node: { TEXT_NODE: number } }).Node = { TEXT_NODE: 3 }
}

// Minimal DOM-shape mock: findIndices only reads `getAttribute`, `parentElement`,
// and the constants `Node.TEXT_NODE` / `Node.ELEMENT_NODE`. Avoids pulling in JSDOM
// for a helper whose only DOM use is walking ancestors.
type MockEl = {
  nodeType: number
  parentElement: MockEl | null
  attrs: Record<string, string>
  getAttribute: (name: string) => string | null
}

function el(attrs: Record<string, string>, parent: MockEl | null = null): MockEl {
  const node: MockEl = {
    nodeType: 1, // ELEMENT_NODE
    parentElement: parent,
    attrs,
    getAttribute(name) {
      return Object.hasOwn(this.attrs, name) ? this.attrs[name] : null
    },
  }
  return node
}

describe("findIndices", () => {
  it("returns null when no ancestor carries message/part indices", () => {
    const leaf = el({}, el({}, null))
    expect(findIndices(leaf as unknown as Node)).toBeNull()
  })

  it("reads contentType from the part-wrapper element (the one with data-part-index)", () => {
    // Structure: <div data-message-index="0">
    //             <div data-part-index="2" data-content-type="text">
    //               <span ...>  <-- leaf
    //             </div>
    //           </div>
    const messageEl = el({ "data-message-index": "0" })
    const partEl = el({ "data-part-index": "2", "data-content-type": "text" }, messageEl)
    const leaf = el({}, partEl)

    expect(findIndices(leaf as unknown as Node)).toEqual({
      messageIndex: 0,
      partIndex: 2,
      contentType: "text",
    })
  })

  it("ignores data-content-type on inner elements below the part wrapper", () => {
    // Regression: <pre data-content-type="json"> inside a text part wrapper.
    // The inside-out walk must NOT latch onto the inner marker and misreport
    // the content type — otherwise selection-detector rejects the selection
    // as non-annotatable.
    const messageEl = el({ "data-message-index": "0" })
    const partEl = el({ "data-part-index": "1", "data-content-type": "text" }, messageEl)
    const preEl = el({ "data-content-type": "json" }, partEl)
    const codeEl = el({}, preEl)
    const leaf = el({}, codeEl)

    const result = findIndices(leaf as unknown as Node)
    expect(result?.contentType).toBe("text")
    expect(result?.partIndex).toBe(1)
  })

  it("defaults contentType to 'text' when the part wrapper has none", () => {
    const messageEl = el({ "data-message-index": "0" })
    const partEl = el({ "data-part-index": "0" }, messageEl)
    const leaf = el({}, partEl)

    expect(findIndices(leaf as unknown as Node)?.contentType).toBe("text")
  })
})
