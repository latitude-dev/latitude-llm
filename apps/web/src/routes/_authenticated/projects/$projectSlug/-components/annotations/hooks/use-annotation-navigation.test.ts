// @vitest-environment jsdom
import { TraceId } from "@domain/shared"
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { AnnotationRecord } from "../../../../../../../domains/annotations/annotations.functions.ts"
import { useAnnotationNavigation } from "./use-annotation-navigation.ts"
import type { TextSelectionPopoverControls } from "./use-annotation-popover.ts"

function createRect(left: number, bottom: number): DOMRect {
  return {
    x: left,
    y: bottom - 20,
    width: 80,
    height: 20,
    top: bottom - 20,
    right: left + 80,
    bottom,
    left,
    toJSON: () => ({}),
  } as DOMRect
}

function createAnnotationRecord(): AnnotationRecord {
  return {
    id: "ann-text-1",
    organizationId: "org-1",
    projectId: "proj-1",
    sessionId: null,
    traceId: TraceId("trace-1"),
    spanId: null,
    source: "annotation",
    sourceId: "UI",
    simulationId: null,
    issueId: null,
    value: 1,
    passed: true,
    feedback: "Looks good",
    metadata: {
      rawFeedback: "Looks good",
      messageIndex: 1,
      partIndex: 0,
      startOffset: 0,
      endOffset: 12,
    },
    error: null,
    errored: false,
    duration: 0,
    tokens: 0,
    cost: 0,
    draftedAt: null,
    annotatorId: "user-1",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  }
}

describe("useAnnotationNavigation", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal("cancelAnimationFrame", vi.fn())
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.innerHTML = ""
  })

  it("opens the text-selection popover only after scrollend on the scroll container", () => {
    const container = document.createElement("div")
    const partRoot = document.createElement("div")
    partRoot.setAttribute("data-part-index", "0")

    const textElement = document.createElement("button")
    textElement.setAttribute("data-annotation-id", "ann-text-1")
    let currentRect = createRect(40, 140)
    textElement.getBoundingClientRect = () => currentRect
    textElement.scrollIntoView = vi.fn()
    const clickSpy = vi.spyOn(textElement, "click")

    partRoot.appendChild(textElement)
    container.appendChild(partRoot)
    document.body.appendChild(container)

    const openExistingAnnotationPopover = vi.fn<TextSelectionPopoverControls["openExistingAnnotationPopover"]>()
    const updateTextSelectionPopoverPosition =
      vi.fn<TextSelectionPopoverControls["updateTextSelectionPopoverPosition"]>()
    const textSelectionPopoverControlsRef = {
      current: {
        openExistingAnnotationPopover,
        updateTextSelectionPopoverPosition,
      } satisfies TextSelectionPopoverControls,
    }

    const annotation = createAnnotationRecord()

    const { result } = renderHook(() =>
      useAnnotationNavigation({
        scrollContainerRef: { current: container },
        textSelectionPopoverControlsRef,
      }),
    )

    act(() => {
      result.current.scrollToAnnotation(annotation)
    })

    expect(textElement.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" })
    expect(openExistingAnnotationPopover).not.toHaveBeenCalled()
    expect(updateTextSelectionPopoverPosition).not.toHaveBeenCalled()
    expect(clickSpy).not.toHaveBeenCalled()

    currentRect = createRect(72, 220)
    act(() => {
      container.dispatchEvent(new Event("scrollend"))
    })

    expect(openExistingAnnotationPopover).toHaveBeenCalledTimes(1)
    expect(openExistingAnnotationPopover).toHaveBeenCalledWith(annotation, { x: 72, y: 220 })
    expect(updateTextSelectionPopoverPosition).not.toHaveBeenCalled()
    expect(clickSpy).not.toHaveBeenCalled()
  })
})
