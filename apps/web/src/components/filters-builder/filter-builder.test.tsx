// @vitest-environment jsdom
import type { FilterSet } from "@domain/shared"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { FilterBuilder } from "./filter-builder.tsx"

vi.mock("./use-annotator-items.ts", () => ({
  useAnnotatorFilterItems: () => [],
}))

afterEach(cleanup)

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

afterAll(() => vi.unstubAllGlobals())

function renderBuilder(value: FilterSet, onChange = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <FilterBuilder mode="traces" projectId="project-id" value={value} onChange={onChange} />
    </QueryClientProvider>,
  )

  return onChange
}

describe("FilterBuilder", () => {
  it("shows exact text-filter values as removable chips", () => {
    const firstSessionId = "905c68ca4ece118dc599d7800911214a"
    const secondSessionId = "6a3eeea33a0491b1a7953eca399bce71"
    const onChange = renderBuilder({
      sessionId: [{ op: "in", value: [firstSessionId, secondSessionId] }],
    })

    const firstChip = screen.getByText(firstSessionId).closest("[data-slot='combobox-chip']")
    const removeButton = firstChip?.querySelector("button")
    expect(removeButton).toBeInstanceOf(HTMLButtonElement)
    fireEvent.click(removeButton as HTMLButtonElement)

    expect(onChange).toHaveBeenCalledWith({
      sessionId: [{ op: "in", value: [secondSessionId] }],
    })
  })

  it("keeps substring text filters editable as text", () => {
    renderBuilder({ sessionId: [{ op: "contains", value: "session-prefix" }] })

    expect(screen.getByPlaceholderText<HTMLInputElement>("Filter by session...").value).toBe("session-prefix")
  })
})
