// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mockCreateAnnotation = vi.fn()
const mockUpdateAnnotation = vi.fn()
const mockDeleteAnnotation = vi.fn()

const mockAnnotations = [
  {
    id: "ann-1",
    passed: true,
    feedback: "Good response",
    issueId: null,
    draftedAt: "2024-01-01",
    metadata: { rawFeedback: "Good response", messageIndex: 1, partIndex: 0, startOffset: 5, endOffset: 15 },
  },
]

const mockHighlightRanges = [
  {
    messageIndex: 1,
    partIndex: 0,
    startOffset: 5,
    endOffset: 15,
    type: "annotation" as const,
    passed: true,
    id: "ann-1",
  },
]

vi.mock("./use-trace-annotations-data.ts", () => ({
  useTraceAnnotationsData: vi.fn(() => ({
    annotations: mockAnnotations,
    isAnnotationsLoading: false,
    highlightRanges: mockHighlightRanges,
    messageLevelAnnotations: new Map(),
    createAnnotation: mockCreateAnnotation,
    updateAnnotation: mockUpdateAnnotation,
    deleteAnnotation: mockDeleteAnnotation,
    isCreatePending: false,
    isUpdatePending: false,
    isDeletePending: false,
  })),
}))

vi.mock("../../../../../../../domains/annotations/annotations.functions.ts", () => ({
  isDraftAnnotation: vi.fn((ann) => ann.draftedAt !== null),
}))

import { useAnnotationPopover } from "./use-annotation-popover.ts"

describe("useAnnotationPopover", () => {
  beforeEach(() => {
    mockCreateAnnotation.mockClear()
    mockUpdateAnnotation.mockClear()
    mockDeleteAnnotation.mockClear()
  })

  it("returns initial state with no popover open", () => {
    const { result } = renderHook(() =>
      useAnnotationPopover({ projectId: "proj-1", traceId: "trace-1", isActive: true }),
    )

    expect(result.current.popoverState).toBeNull()
    expect(result.current.textSelectionPopoverPosition).toBeNull()
    expect(result.current.textSelectionAnnotations).toHaveLength(0)
  })

  it("does not open popover when not active", () => {
    const { result } = renderHook(() =>
      useAnnotationPopover({ projectId: "proj-1", traceId: "trace-1", isActive: false }),
    )

    act(() => {
      result.current.openAnnotationPopover({
        kind: "new",
        anchor: { messageIndex: 0, partIndex: 0, startOffset: 0, endOffset: 5, selectedText: "hello" },
        position: { x: 100, y: 200 },
        passed: null,
        comment: "",
        issueId: null,
      })
    })

    expect(result.current.popoverState).toBeNull()
  })

  it("opens popover for new annotation when active", () => {
    const { result } = renderHook(() =>
      useAnnotationPopover({ projectId: "proj-1", traceId: "trace-1", isActive: true }),
    )

    act(() => {
      result.current.openAnnotationPopover({
        kind: "new",
        anchor: { messageIndex: 0, partIndex: 0, startOffset: 0, endOffset: 5, selectedText: "hello" },
        position: { x: 100, y: 200 },
        passed: null,
        comment: "",
        issueId: null,
      })
    })

    expect(result.current.popoverState).not.toBeNull()
    expect(result.current.popoverState?.kind).toBe("new")
    expect(result.current.textSelectionPopoverPosition).toEqual({ x: 100, y: 200 })
  })

  it("closes popover", () => {
    const { result } = renderHook(() =>
      useAnnotationPopover({ projectId: "proj-1", traceId: "trace-1", isActive: true }),
    )

    act(() => {
      result.current.openAnnotationPopover({
        kind: "new",
        anchor: { messageIndex: 0, partIndex: 0, startOffset: 0, endOffset: 5, selectedText: "hello" },
        position: { x: 100, y: 200 },
        passed: null,
        comment: "",
        issueId: null,
      })
    })

    expect(result.current.popoverState).not.toBeNull()

    act(() => {
      result.current.closeAnnotationPopover()
    })

    expect(result.current.popoverState).toBeNull()
  })

  describe("handleTextSelect", () => {
    it("opens new annotation popover for unmatched selection", () => {
      const { result } = renderHook(() =>
        useAnnotationPopover({ projectId: "proj-1", traceId: "trace-1", isActive: true }),
      )

      act(() => {
        result.current.handleTextSelect(
          { messageIndex: 2, partIndex: 0, startOffset: 0, endOffset: 10, selectedText: "some text" },
          { x: 50, y: 100 },
        )
      })

      expect(result.current.popoverState?.kind).toBe("new")
      expect(result.current.popoverState?.passed).toBeNull()
      expect(result.current.popoverState?.comment).toBe("")
    })

    it("opens existing annotation popover when selection matches highlight", () => {
      const { result } = renderHook(() =>
        useAnnotationPopover({ projectId: "proj-1", traceId: "trace-1", isActive: true }),
      )

      act(() => {
        result.current.handleTextSelect(
          { messageIndex: 1, partIndex: 0, startOffset: 5, endOffset: 15, selectedText: "good text" },
          { x: 50, y: 100 },
        )
      })

      expect(result.current.popoverState?.kind).toBe("existing")
      if (result.current.popoverState?.kind === "existing") {
        expect(result.current.popoverState.annotation.id).toBe("ann-1")
      }
      expect(result.current.textSelectionAnnotations).toHaveLength(1)
    })
  })

  describe("createTextSelectionAnnotation", () => {
    it("creates annotation with anchor from new popover state", () => {
      const { result } = renderHook(() =>
        useAnnotationPopover({ projectId: "proj-1", traceId: "trace-1", isActive: true }),
      )

      act(() => {
        result.current.openAnnotationPopover({
          kind: "new",
          anchor: { messageIndex: 3, partIndex: 1, startOffset: 10, endOffset: 20, selectedText: "looks good" },
          position: { x: 100, y: 200 },
          passed: null,
          comment: "",
          issueId: null,
        })
      })

      act(() => {
        result.current.createTextSelectionAnnotation({
          passed: true,
          comment: "Looks good",
          issueId: null,
        })
      })

      expect(mockCreateAnnotation).toHaveBeenCalledWith(
        {
          passed: true,
          comment: "Looks good",
          issueId: null,
          anchor: { messageIndex: 3, partIndex: 1, startOffset: 10, endOffset: 20 },
          spanId: null,
        },
        { onSuccess: expect.any(Function) },
      )
    })

    it("includes spanId when getSpanIdForMessage is provided", () => {
      const getSpanIdForMessage = vi.fn((idx: number) => `span-${idx}`)

      const { result } = renderHook(() =>
        useAnnotationPopover({
          projectId: "proj-1",
          traceId: "trace-1",
          isActive: true,
          getSpanIdForMessage,
        }),
      )

      act(() => {
        result.current.openAnnotationPopover({
          kind: "new",
          anchor: { messageIndex: 2, partIndex: 0, startOffset: 0, endOffset: 5, selectedText: "not g" },
          position: { x: 100, y: 200 },
          passed: null,
          comment: "",
          issueId: null,
        })
      })

      act(() => {
        result.current.createTextSelectionAnnotation({
          passed: false,
          comment: "Not good",
          issueId: "issue-1",
        })
      })

      expect(getSpanIdForMessage).toHaveBeenCalledWith(2)
      expect(mockCreateAnnotation).toHaveBeenCalledWith(
        expect.objectContaining({
          spanId: "span-2",
        }),
        expect.anything(),
      )
    })

    it("does nothing when popover is not open", () => {
      const { result } = renderHook(() =>
        useAnnotationPopover({ projectId: "proj-1", traceId: "trace-1", isActive: true }),
      )

      act(() => {
        result.current.createTextSelectionAnnotation({
          passed: true,
          comment: "Test",
          issueId: null,
        })
      })

      expect(mockCreateAnnotation).not.toHaveBeenCalled()
    })
  })

  describe("updateTextSelectionAnnotation", () => {
    it("calls updateAnnotation with correct parameters", () => {
      const { result } = renderHook(() =>
        useAnnotationPopover({ projectId: "proj-1", traceId: "trace-1", isActive: true }),
      )

      act(() => {
        result.current.updateTextSelectionAnnotation("ann-1", {
          passed: false,
          comment: "Updated comment",
          issueId: "issue-2",
        })
      })

      expect(mockUpdateAnnotation).toHaveBeenCalledWith(
        "ann-1",
        { passed: false, comment: "Updated comment", issueId: "issue-2" },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      )
    })
  })

  describe("highlightRanges with handlers", () => {
    it("adds onClick handlers to highlight ranges", () => {
      const { result } = renderHook(() =>
        useAnnotationPopover({ projectId: "proj-1", traceId: "trace-1", isActive: true }),
      )

      expect(result.current.highlightRanges).toHaveLength(1)
      expect(result.current.highlightRanges[0]?.onClick).toBeDefined()
    })

    it("opens existing annotation popover when highlight is clicked", () => {
      const { result } = renderHook(() =>
        useAnnotationPopover({ projectId: "proj-1", traceId: "trace-1", isActive: true }),
      )

      const onClick = result.current.highlightRanges[0]?.onClick
      expect(onClick).toBeDefined()

      act(() => {
        onClick?.({ x: 150, y: 250 })
      })

      expect(result.current.popoverState?.kind).toBe("existing")
      expect(result.current.popoverState?.position).toEqual({ x: 150, y: 250 })
    })
  })

  describe("isPopoverEditable", () => {
    it("returns true for new annotations", () => {
      const { result } = renderHook(() =>
        useAnnotationPopover({ projectId: "proj-1", traceId: "trace-1", isActive: true }),
      )

      act(() => {
        result.current.openAnnotationPopover({
          kind: "new",
          anchor: { messageIndex: 0, partIndex: 0, startOffset: 0, endOffset: 5, selectedText: "hello" },
          position: { x: 100, y: 200 },
          passed: null,
          comment: "",
          issueId: null,
        })
      })

      expect(result.current.isPopoverEditable).toBe(true)
    })

    it("returns true for draft annotations", () => {
      const { result } = renderHook(() =>
        useAnnotationPopover({ projectId: "proj-1", traceId: "trace-1", isActive: true }),
      )

      act(() => {
        result.current.handleTextSelect(
          { messageIndex: 1, partIndex: 0, startOffset: 5, endOffset: 15, selectedText: "good text" },
          { x: 50, y: 100 },
        )
      })

      expect(result.current.isPopoverEditable).toBe(true)
    })
  })
})
