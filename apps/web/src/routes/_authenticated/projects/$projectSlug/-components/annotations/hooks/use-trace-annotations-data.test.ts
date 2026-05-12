// @vitest-environment jsdom
import { generateId } from "@domain/shared"
import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mockMutate = vi.fn()
const mockAnnotations = [
  {
    id: "ann-1",
    passed: true,
    feedback: "Good response",
    annotatorId: "user-1",
    sourceId: "UI",
    metadata: { rawFeedback: "Good response", messageIndex: 0 },
  },
  {
    id: "ann-2",
    passed: false,
    feedback: "Bad response",
    annotatorId: "user-2",
    sourceId: "UI",
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
  pickUserFromMembersMap: vi.fn((_map: unknown, id: string | null) =>
    id ? { id, name: `User ${id}`, imageSrc: null } : null,
  ),
}))

import { useAnnotationsByTrace } from "../../../../../../../domains/annotations/annotations.collection.ts"
import { getAnnotatorIdForBucketing, useTraceAnnotationsData } from "./use-trace-annotations-data.ts"

type AnnotationItem = (typeof mockAnnotations)[number]

function setAnnotationsOnce(items: readonly AnnotationItem[]) {
  vi.mocked(useAnnotationsByTrace).mockReturnValueOnce({
    data: { items },
    isLoading: false,
  } as ReturnType<typeof useAnnotationsByTrace>)
}

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

  describe("agent annotations", () => {
    it("pushes a synthetic Latitude Agent annotator for agent-authored message-level annotations", () => {
      setAnnotationsOnce([
        {
          id: "ann-agent",
          passed: true,
          feedback: "Looks good",
          annotatorId: null as unknown as string,
          sourceId: "SYSTEM",
          metadata: { rawFeedback: "Looks good", messageIndex: 5 },
        },
      ])

      const { result } = renderHook(() => useTraceAnnotationsData({ projectId: "proj-1", traceId: "trace-1" }))

      const msg = result.current.messageLevelAnnotations.get(5)
      expect(msg?.annotators).toEqual([{ id: "agent:SYSTEM", name: "Latitude Agent", imageSrc: null, kind: "agent" }])
    })

    it("dedupes multiple agent annotations that share a sourceId", () => {
      const agentId = generateId()
      setAnnotationsOnce([
        {
          id: "a1",
          passed: true,
          feedback: "",
          annotatorId: null as unknown as string,
          sourceId: agentId,
          metadata: { rawFeedback: "", messageIndex: 0 },
        },
        {
          id: "a2",
          passed: false,
          feedback: "",
          annotatorId: null as unknown as string,
          sourceId: agentId,
          metadata: { rawFeedback: "", messageIndex: 0 },
        },
      ])

      const { result } = renderHook(() => useTraceAnnotationsData({ projectId: "proj-1", traceId: "trace-1" }))

      const msg = result.current.messageLevelAnnotations.get(0)
      expect(msg?.annotations).toHaveLength(2)
      expect(msg?.annotators).toHaveLength(1)
      expect(msg?.annotators[0]?.id).toBe(`agent:${agentId}`)
    })

    it("creates distinct annotators for agents with different sourceIds", () => {
      const agentA = generateId()
      const agentB = generateId()
      setAnnotationsOnce([
        {
          id: "a1",
          passed: true,
          feedback: "",
          annotatorId: null as unknown as string,
          sourceId: agentA,
          metadata: { rawFeedback: "", messageIndex: 2 },
        },
        {
          id: "a2",
          passed: true,
          feedback: "",
          annotatorId: null as unknown as string,
          sourceId: agentB,
          metadata: { rawFeedback: "", messageIndex: 2 },
        },
        {
          id: "a3",
          passed: false,
          feedback: "",
          annotatorId: null as unknown as string,
          sourceId: "SYSTEM",
          metadata: { rawFeedback: "", messageIndex: 2 },
        },
      ])

      const { result } = renderHook(() => useTraceAnnotationsData({ projectId: "proj-1", traceId: "trace-1" }))

      const msg = result.current.messageLevelAnnotations.get(2)
      expect(msg?.annotators.map((a) => a.id)).toEqual([`agent:${agentA}`, `agent:${agentB}`, "agent:SYSTEM"])
    })

    it("combines human and agent annotators on the same message", () => {
      setAnnotationsOnce([
        {
          id: "h1",
          passed: true,
          feedback: "",
          annotatorId: "user-1",
          sourceId: "UI",
          metadata: { rawFeedback: "", messageIndex: 7 },
        },
        {
          id: "a1",
          passed: true,
          feedback: "",
          annotatorId: null as unknown as string,
          sourceId: "SYSTEM",
          metadata: { rawFeedback: "", messageIndex: 7 },
        },
      ])

      const { result } = renderHook(() => useTraceAnnotationsData({ projectId: "proj-1", traceId: "trace-1" }))

      const msg = result.current.messageLevelAnnotations.get(7)
      expect(msg?.annotators).toEqual([
        { id: "user-1", name: "User user-1", imageSrc: null },
        { id: "agent:SYSTEM", name: "Latitude Agent", imageSrc: null, kind: "agent" },
      ])
    })

    it("ignores agent annotations that have a partIndex (those go to highlight ranges)", () => {
      setAnnotationsOnce([
        {
          id: "ar1",
          passed: true,
          feedback: "",
          annotatorId: null as unknown as string,
          sourceId: "SYSTEM",
          metadata: { rawFeedback: "", messageIndex: 3, partIndex: 0, startOffset: 0, endOffset: 4 },
        },
      ])

      const { result } = renderHook(() => useTraceAnnotationsData({ projectId: "proj-1", traceId: "trace-1" }))

      expect(result.current.messageLevelAnnotations.size).toBe(0)
      expect(result.current.highlightRanges).toHaveLength(1)
    })
  })
})

describe("getAnnotatorIdForBucketing", () => {
  it("returns the annotatorId for human-authored annotations", () => {
    expect(
      getAnnotatorIdForBucketing({
        annotatorId: "user-9",
        sourceId: "UI",
      } as Parameters<typeof getAnnotatorIdForBucketing>[0]),
    ).toBe("user-9")
  })

  it("returns the agent-prefixed sourceId for SYSTEM annotations", () => {
    expect(
      getAnnotatorIdForBucketing({
        annotatorId: null,
        sourceId: "SYSTEM",
      } as Parameters<typeof getAnnotatorIdForBucketing>[0]),
    ).toBe("agent:SYSTEM")
  })

  it("returns the agent-prefixed sourceId for flagger CUID annotations", () => {
    const agentId = generateId()
    expect(
      getAnnotatorIdForBucketing({
        annotatorId: null,
        sourceId: agentId,
      } as Parameters<typeof getAnnotatorIdForBucketing>[0]),
    ).toBe(`agent:${agentId}`)
  })

  it("returns null for unauthored, non-agent annotations (e.g. API)", () => {
    expect(
      getAnnotatorIdForBucketing({
        annotatorId: null,
        sourceId: "API",
      } as Parameters<typeof getAnnotatorIdForBucketing>[0]),
    ).toBeNull()
  })
})
