// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mockMutate = vi.fn()
const mockAnnotations = [
  {
    id: "ann-1",
    passed: true,
    feedback: "Good response",
    annotatorId: "user-1",
    metadata: { rawFeedback: "Good response", messageIndex: 0 },
  },
  {
    id: "ann-2",
    passed: false,
    feedback: "Bad response",
    annotatorId: "user-2",
    metadata: { rawFeedback: "Bad response", messageIndex: 1, partIndex: 0, startOffset: 0, endOffset: 10 },
  },
]

vi.mock("../../../../../../../domains/annotations/annotations.collection.ts", () => ({
  useAnnotationsByTrace: vi.fn(() => ({
    data: { items: mockAnnotations },
    isLoading: false,
  })),
  useCreateAnnotation: vi.fn(() => ({
    mutate: mockMutate,
    isPending: false,
  })),
  useUpdateAnnotation: vi.fn(() => ({
    mutate: mockMutate,
    isPending: false,
  })),
  useDeleteAnnotation: vi.fn(() => ({
    mutate: mockMutate,
    isPending: false,
  })),
}))

vi.mock("../../../../../../../domains/members/members.collection.ts", () => ({
  useMemberByUserIdMap: vi.fn(() => new Map()),
}))

vi.mock("../../../../../../../domains/members/pick-users-from-members.ts", () => ({
  pickUserFromMembersMap: vi.fn(() => ({ id: "user-1", name: "User 1", imageSrc: null })),
}))

import { useTraceAnnotationsData } from "./use-trace-annotations-data.ts"

describe("useTraceAnnotationsData", () => {
  beforeEach(() => {
    mockMutate.mockClear()
  })

  it("returns annotations from the query", () => {
    const { result } = renderHook(() => useTraceAnnotationsData({ projectId: "proj-1", traceId: "trace-1" }))

    expect(result.current.annotations).toHaveLength(2)
    expect(result.current.isAnnotationsLoading).toBe(false)
  })

  it("computes highlight ranges for text-selection annotations", () => {
    const { result } = renderHook(() => useTraceAnnotationsData({ projectId: "proj-1", traceId: "trace-1" }))

    expect(result.current.highlightRanges).toHaveLength(1)
    expect(result.current.highlightRanges[0]).toMatchObject({
      messageIndex: 1,
      partIndex: 0,
      startOffset: 0,
      endOffset: 10,
      type: "annotation",
      passed: false,
      id: "ann-2",
    })
  })

  it("computes message-level annotations map", () => {
    const { result } = renderHook(() => useTraceAnnotationsData({ projectId: "proj-1", traceId: "trace-1" }))

    expect(result.current.messageLevelAnnotations.size).toBe(1)
    const msgAnnotations = result.current.messageLevelAnnotations.get(0)
    expect(msgAnnotations?.annotations).toHaveLength(1)
    expect(msgAnnotations?.annotations[0]?.id).toBe("ann-1")
  })

  describe("createAnnotation", () => {
    it("calls mutation with correct payload", () => {
      const { result } = renderHook(() => useTraceAnnotationsData({ projectId: "proj-1", traceId: "trace-1" }))

      act(() => {
        result.current.createAnnotation({
          passed: true,
          comment: "Great job",
          issueId: null,
          anchor: { messageIndex: 2 },
        })
      })

      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "proj-1",
          traceId: "trace-1",
          value: 1,
          passed: true,
          feedback: "Great job",
          anchor: { messageIndex: 2 },
        }),
        undefined,
      )
    })

    it("includes spanId when provided", () => {
      const { result } = renderHook(() => useTraceAnnotationsData({ projectId: "proj-1", traceId: "trace-1" }))

      act(() => {
        result.current.createAnnotation({
          passed: false,
          comment: "Needs work",
          issueId: "issue-1",
          anchor: { messageIndex: 1 },
          spanId: "span-123",
        })
      })

      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          value: 0,
          passed: false,
          feedback: "Needs work",
          issueId: "issue-1",
          spanId: "span-123",
          anchor: { messageIndex: 1 },
        }),
        undefined,
      )
    })

    it("trims whitespace and defaults empty comment to single space", () => {
      const { result } = renderHook(() => useTraceAnnotationsData({ projectId: "proj-1", traceId: "trace-1" }))

      act(() => {
        result.current.createAnnotation({
          passed: true,
          comment: "   ",
          issueId: null,
        })
      })

      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          feedback: " ",
        }),
        undefined,
      )
    })

    it("calls onSuccess callback when provided", () => {
      const onSuccess = vi.fn()
      const { result } = renderHook(() => useTraceAnnotationsData({ projectId: "proj-1", traceId: "trace-1" }))

      act(() => {
        result.current.createAnnotation({ passed: true, comment: "Good", issueId: null }, { onSuccess })
      })

      expect(mockMutate).toHaveBeenCalledWith(expect.anything(), { onSuccess })
    })
  })

  describe("updateAnnotation", () => {
    it("calls mutation with score id and updated data", () => {
      const { result } = renderHook(() => useTraceAnnotationsData({ projectId: "proj-1", traceId: "trace-1" }))

      act(() => {
        result.current.updateAnnotation("ann-1", {
          passed: false,
          comment: "Changed my mind",
          issueId: "issue-2",
        })
      })

      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          scoreId: "ann-1",
          projectId: "proj-1",
          traceId: "trace-1",
          value: 0,
          passed: false,
          feedback: "Changed my mind",
          issueId: "issue-2",
        }),
        undefined,
      )
    })
  })

  describe("deleteAnnotation", () => {
    it("calls mutation with score id", () => {
      const { result } = renderHook(() => useTraceAnnotationsData({ projectId: "proj-1", traceId: "trace-1" }))

      act(() => {
        result.current.deleteAnnotation("ann-1")
      })

      expect(mockMutate).toHaveBeenCalledWith({ scoreId: "ann-1", projectId: "proj-1" }, undefined)
    })
  })
})
