// @vitest-environment jsdom

import { act, useContext, useRef } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { GenAIMessage } from "rosetta-ai"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TextSelectionContext, TextSelectionProvider } from "./text-selection.tsx"

const SELECTED_TEXT = "select this"
const messages = [
  { role: "assistant", parts: [{ type: "text", content: SELECTED_TEXT }] },
] as const satisfies readonly GenAIMessage[]

function deferredClipboardWrite() {
  let resolve!: () => void
  const promise = new Promise<void>((res) => {
    resolve = res
  })
  const writeText = vi.fn((_text: string) => promise)
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  })
  return { promise, resolve, writeText }
}

function SelectionProbe() {
  const context = useContext(TextSelectionContext)
  if (!context) throw new Error("Text selection context is unavailable")

  return (
    <>
      <div data-testid="detected-selection">{context.detected?.selectedText ?? ""}</div>
      <button type="button" disabled={!context.detected} onClick={() => void context.resolveAndCopy()}>
        Copy
      </button>
    </>
  )
}

function SelectionHarness() {
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <TextSelectionProvider messages={messages} containerRef={containerRef}>
      <div ref={containerRef}>
        <div data-message-index="0">
          <div data-part-index="0" data-content-type="text">
            {SELECTED_TEXT}
          </div>
        </div>
      </div>
      <SelectionProbe />
    </TextSelectionProvider>
  )
}

function selectConversationText(container: HTMLElement) {
  const target = container.querySelector<HTMLElement>("[data-part-index='0']")
  if (!target) throw new Error("Selectable text was not rendered")
  const textNode = target.firstChild
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) throw new Error("Selectable text node was not rendered")

  const range = document.createRange()
  range.setStart(textNode, 0)
  range.setEnd(textNode, SELECTED_TEXT.length)

  const selection = window.getSelection()
  if (!selection) throw new Error("Browser selection is unavailable")
  selection.removeAllRanges()
  selection.addRange(range)

  act(() => {
    target.dispatchEvent(new Event("selectstart", { bubbles: true }))
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
  })
}

let container: HTMLDivElement
let root: Root | null = null
let clipboardDescriptor: PropertyDescriptor | undefined
let rangeRectDescriptor: PropertyDescriptor | undefined

beforeEach(() => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard")
  rangeRectDescriptor = Object.getOwnPropertyDescriptor(Range.prototype, "getBoundingClientRect")
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => new DOMRect(0, 0, 120, 18),
  })
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0))
  vi.stubGlobal("cancelAnimationFrame", (frame: number) => window.clearTimeout(frame))
})

afterEach(() => {
  if (root) {
    const currentRoot = root
    act(() => currentRoot.unmount())
  }
  root = null
  container.remove()
  if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor)
  else Reflect.deleteProperty(navigator, "clipboard")
  if (rangeRectDescriptor) Object.defineProperty(Range.prototype, "getBoundingClientRect", rangeRectDescriptor)
  else Reflect.deleteProperty(Range.prototype, "getBoundingClientRect")
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("TextSelectionProvider", () => {
  it("preserves an identical reselection when the earlier copy resolves", async () => {
    const clipboard = deferredClipboardWrite()
    if (!root) throw new Error("React root was not created")
    act(() => root?.render(<SelectionHarness />))

    selectConversationText(container)
    const copyButton = container.querySelector<HTMLButtonElement>("button")
    if (!copyButton) throw new Error("Copy button was not rendered")
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    expect(copyButton.disabled).toBe(false)

    act(() => copyButton.click())
    expect(clipboard.writeText).toHaveBeenCalledWith(SELECTED_TEXT)

    selectConversationText(container)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    expect(copyButton.disabled).toBe(false)

    await act(async () => {
      clipboard.resolve()
      await clipboard.promise
    })

    expect(window.getSelection()?.toString()).toBe(SELECTED_TEXT)
    expect(container.querySelector('[data-testid="detected-selection"]')?.textContent).toBe(SELECTED_TEXT)
  })
})
