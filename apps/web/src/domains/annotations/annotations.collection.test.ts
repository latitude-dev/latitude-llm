import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listAnnotationCountsByTraceIds: vi.fn(),
  listAnnotationsBySession: vi.fn(),
  listAnnotationsByTrace: vi.fn(),
  useMutation: vi.fn(),
  useQueries: vi.fn(() => []),
  useQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
  useQueryClient: vi.fn(() => ({
    cancelQueries: vi.fn(),
    getQueriesData: vi.fn(() => []),
    invalidateQueries: vi.fn(),
    setQueriesData: vi.fn(),
    setQueryData: vi.fn(),
  })),
}))

vi.mock("@tanstack/react-query", () => ({
  useMutation: mocks.useMutation,
  useQueries: mocks.useQueries,
  useQuery: mocks.useQuery,
  useQueryClient: mocks.useQueryClient,
}))

vi.mock("./annotations.functions.ts", () => ({
  approveSystemAnnotation: vi.fn(),
  createAnnotation: vi.fn(),
  deleteAnnotation: vi.fn(),
  listAnnotationCountsByTraceIds: mocks.listAnnotationCountsByTraceIds,
  listAnnotationsBySession: mocks.listAnnotationsBySession,
  listAnnotationsByTrace: mocks.listAnnotationsByTrace,
  rejectSystemAnnotation: vi.fn(),
  updateAnnotation: vi.fn(),
}))

import { useAnnotationsByTrace } from "./annotations.collection.ts"

describe("useAnnotationsByTrace", () => {
  beforeEach(() => {
    mocks.useQuery.mockClear()
  })

  it("does not fetch when traceId is empty", () => {
    useAnnotationsByTrace({ projectId: "project-1", traceId: "" })

    expect(mocks.useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }))
  })

  it("does not fetch when projectId is empty", () => {
    useAnnotationsByTrace({ projectId: "", traceId: "0123456789abcdef0123456789abcdef" })

    expect(mocks.useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }))
  })

  it("fetches when ids are present and the query is enabled", () => {
    useAnnotationsByTrace({ projectId: "project-1", traceId: "0123456789abcdef0123456789abcdef" })

    expect(mocks.useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }))
  })

  it("honors explicit disabled state", () => {
    useAnnotationsByTrace({ projectId: "project-1", traceId: "0123456789abcdef0123456789abcdef", enabled: false })

    expect(mocks.useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }))
  })
})
