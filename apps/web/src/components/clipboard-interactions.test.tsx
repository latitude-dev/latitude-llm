// @vitest-environment jsdom

import { Conversation, CopyableText, CopyButton, toast, useToast } from "@repo/ui"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const SENTINEL_TOAST = "clipboard-feedback-sentinel"
const SELECTED_TEXT = "select this"

function deferredClipboardWrite() {
  let resolve!: () => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  const writeText = vi.fn((_text: string) => promise)
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  })
  return { promise, resolve, reject, writeText }
}

function deferredClipboardWrites() {
  const writes: Array<{
    promise: Promise<void>
    resolve: () => void
    reject: (reason?: unknown) => void
  }> = []
  const writeText = vi.fn((_text: string) => {
    let resolve!: () => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<void>((res, rej) => {
      resolve = res
      reject = rej
    })
    writes.push({ promise, resolve, reject })
    return promise
  })
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  })
  return { writes, writeText }
}

function ToastProbe() {
  const { toasts } = useToast()
  return (
    <div data-testid="toast-messages">
      {toasts.map(({ id, title }) => (
        <div key={id}>{title}</div>
      ))}
    </div>
  )
}

function renderWithToastProbe(children: ReactNode) {
  toast({ title: SENTINEL_TOAST })
  return render(
    <>
      {children}
      <ToastProbe />
    </>,
  )
}

async function selectConversationText(text = SELECTED_TEXT) {
  await screen.findByText("Please select this sentence.")
  const part = document.querySelector('[data-part-index="0"]')
  if (!part) throw new Error("Conversation text part was not rendered")

  const walker = document.createTreeWalker(part, NodeFilter.SHOW_TEXT)
  let textNode = walker.nextNode()
  while (textNode && !textNode.textContent?.includes(text)) textNode = walker.nextNode()
  if (!textNode?.textContent) throw new Error("Selectable conversation text was not rendered")

  const start = textNode.textContent.indexOf(text)
  const range = document.createRange()
  range.setStart(textNode, start)
  range.setEnd(textNode, start + text.length)

  const selection = window.getSelection()
  if (!selection) throw new Error("Browser selection is unavailable")
  selection.removeAllRanges()
  selection.addRange(range)

  await act(async () => {
    part.dispatchEvent(new Event("selectstart", { bubbles: true }))
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
  })
}

function ConversationConsumer({ onDismiss }: { onDismiss?: () => void } = {}) {
  return (
    <Conversation
      messages={[{ role: "assistant", parts: [{ type: "text", content: "Please select this sentence." }] }]}
      onTextSelect={() => undefined}
      onSelectionDismiss={onDismiss}
    />
  )
}

let clipboardDescriptor: PropertyDescriptor | undefined
let rangeRectDescriptor: PropertyDescriptor | undefined

beforeEach(() => {
  clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard")
  rangeRectDescriptor = Object.getOwnPropertyDescriptor(Range.prototype, "getBoundingClientRect")
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => new DOMRect(0, 0, 120, 18),
  })
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0))
  vi.stubGlobal("cancelAnimationFrame", (frame: number) => window.clearTimeout(frame))
})

afterEach(() => {
  cleanup()
  if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor)
  else Reflect.deleteProperty(navigator, "clipboard")
  if (rangeRectDescriptor) Object.defineProperty(Range.prototype, "getBoundingClientRect", rangeRectDescriptor)
  else Reflect.deleteProperty(Range.prototype, "getBoundingClientRect")
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("clipboard controls", () => {
  it("shows CopyButton success only after the clipboard promise resolves", async () => {
    const clipboard = deferredClipboardWrite()
    const view = renderWithToastProbe(<CopyButton value="trace-123" />)

    fireEvent.click(screen.getByRole("button"))
    expect(clipboard.writeText).toHaveBeenCalledWith("trace-123")
    expect(view.container.querySelector(".lucide-check")).toBeNull()

    await act(async () => {
      clipboard.resolve()
      await clipboard.promise
    })

    expect(view.container.querySelector(".lucide-check")).not.toBeNull()
    expect(screen.getByText(SENTINEL_TOAST)).toBeDefined()
  })

  it("reports CopyButton rejection without showing copied state", async () => {
    const clipboard = deferredClipboardWrite()
    const view = renderWithToastProbe(<CopyButton value="trace-123" />)

    fireEvent.click(screen.getByRole("button"))
    await act(async () => {
      clipboard.reject(new Error("permission denied"))
      await clipboard.promise.catch(() => undefined)
    })

    expect(await screen.findByText("Unable to copy to clipboard")).toBeDefined()
    expect(view.container.querySelector(".lucide-check")).toBeNull()
  })

  it("does not schedule copied feedback after CopyButton unmounts during a write", async () => {
    const clipboard = deferredClipboardWrite()
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout")
    const view = renderWithToastProbe(<CopyButton value="trace-123" />)

    fireEvent.click(screen.getByRole("button"))
    view.unmount()
    await act(async () => {
      clipboard.resolve()
      await clipboard.promise
    })

    render(<ToastProbe />)
    expect(screen.getByText(SENTINEL_TOAST)).toBeDefined()
    expect(setTimeoutSpy.mock.calls.some(([, delay]) => delay === 2000)).toBe(false)
  })

  it("shows CopyableText success only after the clipboard promise resolves", async () => {
    const clipboard = deferredClipboardWrite()
    const view = renderWithToastProbe(<CopyableText value="project-456" />)

    fireEvent.click(screen.getByRole("button"))
    expect(clipboard.writeText).toHaveBeenCalledWith("project-456")
    expect(screen.getByText(SENTINEL_TOAST)).toBeDefined()
    expect(screen.queryByText("Copied to clipboard")).toBeNull()

    await act(async () => {
      clipboard.resolve()
      await clipboard.promise
    })

    expect(await screen.findByText("Copied to clipboard")).toBeDefined()
    expect(view.container.querySelector(".lucide-check")).not.toBeNull()
  })

  it("reports CopyableText rejection without success feedback", async () => {
    const clipboard = deferredClipboardWrite()
    renderWithToastProbe(<CopyableText value="project-456" />)

    fireEvent.click(screen.getByRole("button"))
    await act(async () => {
      clipboard.reject(new Error("permission denied"))
      await clipboard.promise.catch(() => undefined)
    })

    expect(await screen.findByText("Unable to copy to clipboard")).toBeDefined()
    expect(screen.queryByText("Copied to clipboard")).toBeNull()
  })

  it("does not report CopyableText success after unmount during a write", async () => {
    const clipboard = deferredClipboardWrite()
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout")
    const view = renderWithToastProbe(<CopyableText value="project-456" />)

    fireEvent.click(screen.getByRole("button"))
    view.unmount()
    await act(async () => {
      clipboard.resolve()
      await clipboard.promise
    })

    render(<ToastProbe />)
    expect(screen.getByText(SENTINEL_TOAST)).toBeDefined()
    expect(screen.queryByText("Copied to clipboard")).toBeNull()
    expect(setTimeoutSpy.mock.calls.some(([, delay]) => delay === 2000)).toBe(false)
  })

  it("copies selected Conversation text and reports success only after resolution", async () => {
    const clipboard = deferredClipboardWrite()
    const onDismiss = vi.fn()
    renderWithToastProbe(<ConversationConsumer onDismiss={onDismiss} />)
    await selectConversationText()

    fireEvent.click(await screen.findByRole("button", { name: "Copy" }))
    expect(clipboard.writeText).toHaveBeenCalledWith(SELECTED_TEXT)
    expect(screen.getByText(SENTINEL_TOAST)).toBeDefined()
    expect(window.getSelection()?.toString()).toBe(SELECTED_TEXT)

    await act(async () => {
      clipboard.resolve()
      await clipboard.promise
    })

    expect(await screen.findByText("Copied to clipboard")).toBeDefined()
    expect(window.getSelection()?.toString()).toBe("")
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it("reports Conversation clipboard rejection and preserves the selection", async () => {
    const clipboard = deferredClipboardWrite()
    renderWithToastProbe(<ConversationConsumer />)
    await selectConversationText()

    fireEvent.click(await screen.findByRole("button", { name: "Copy" }))
    await act(async () => {
      clipboard.reject(new Error("permission denied"))
      await clipboard.promise.catch(() => undefined)
    })

    expect(await screen.findByText("Unable to copy to clipboard")).toBeDefined()
    expect(screen.queryByText("Copied to clipboard")).toBeNull()
    expect(window.getSelection()?.toString()).toBe(SELECTED_TEXT)
  })

  it("does not report Conversation clipboard success after unmount during a write", async () => {
    const clipboard = deferredClipboardWrite()
    const view = renderWithToastProbe(<ConversationConsumer />)
    await selectConversationText()

    fireEvent.click(await screen.findByRole("button", { name: "Copy" }))
    view.unmount()
    await act(async () => {
      clipboard.resolve()
      await clipboard.promise
    })

    render(<ToastProbe />)
    expect(screen.getByText(SENTINEL_TOAST)).toBeDefined()
    expect(screen.queryByText("Copied to clipboard")).toBeNull()
  })

  it("preserves a newer Conversation selection when an earlier copy resolves", async () => {
    const clipboard = deferredClipboardWrite()
    renderWithToastProbe(<ConversationConsumer />)
    await selectConversationText()
    fireEvent.click(await screen.findByRole("button", { name: "Copy" }))

    await selectConversationText("sentence")
    await screen.findByRole("button", { name: "Copy" })
    await act(async () => {
      clipboard.resolve()
      await clipboard.promise
    })

    expect(window.getSelection()?.toString()).toBe("sentence")
    expect(screen.getByRole("button", { name: "Copy" })).toBeDefined()
  })

  it("preserves a newer selection of identical text outside the Conversation", async () => {
    const clipboard = deferredClipboardWrite()
    renderWithToastProbe(
      <>
        <ConversationConsumer />
        <p data-testid="other-selection">{SELECTED_TEXT}</p>
      </>,
    )
    await selectConversationText()
    fireEvent.click(await screen.findByRole("button", { name: "Copy" }))

    const other = screen.getByTestId("other-selection")
    const range = document.createRange()
    range.selectNodeContents(other)
    const selection = window.getSelection()
    if (!selection) throw new Error("Browser selection is unavailable")
    selection.removeAllRanges()
    selection.addRange(range)
    fireEvent(other, new Event("selectstart", { bubbles: true }))
    fireEvent.mouseUp(document)
    await act(async () => {
      clipboard.resolve()
      await clipboard.promise
    })

    expect(selection.toString()).toBe(SELECTED_TEXT)
    expect(selection.getRangeAt(0).startContainer).toBe(other)
  })

  it("ignores stale feedback from overlapping CopyButton writes", async () => {
    vi.useFakeTimers()
    try {
      const clipboard = deferredClipboardWrites()
      const view = renderWithToastProbe(<CopyButton value="trace-123" />)

      fireEvent.click(screen.getByRole("button"))
      fireEvent.click(screen.getByRole("button"))
      expect(clipboard.writeText).toHaveBeenCalledTimes(2)

      await act(async () => {
        clipboard.writes[0].resolve()
        await clipboard.writes[0].promise
      })
      expect(view.container.querySelector(".lucide-check")).toBeNull()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500)
      })
      await act(async () => {
        clipboard.writes[1].resolve()
        await clipboard.writes[1].promise
      })
      expect(view.container.querySelector(".lucide-check")).not.toBeNull()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })
      expect(view.container.querySelector(".lucide-check")).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it("ignores stale feedback from overlapping CopyableText writes", async () => {
    vi.useFakeTimers()
    try {
      const clipboard = deferredClipboardWrites()
      const view = renderWithToastProbe(<CopyableText value="project-456" />)

      fireEvent.click(screen.getByRole("button"))
      fireEvent.click(screen.getByRole("button"))
      expect(clipboard.writeText).toHaveBeenCalledTimes(2)

      await act(async () => {
        clipboard.writes[0].resolve()
        await clipboard.writes[0].promise
      })
      expect(view.container.querySelector(".lucide-check")).toBeNull()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500)
      })
      await act(async () => {
        clipboard.writes[1].resolve()
        await clipboard.writes[1].promise
      })
      expect(view.container.querySelector(".lucide-check")).not.toBeNull()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })
      expect(view.container.querySelector(".lucide-check")).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
