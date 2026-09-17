// @vitest-environment jsdom
import type { FilterSet } from "@domain/shared"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { FiltersBuilderFields } from "./filters-builder-fields.tsx"

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

function renderFilters(filters: FilterSet, onFiltersChange = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <FiltersBuilderFields
        mode="sessions"
        projectId="project-id"
        filters={filters}
        onFiltersChange={onFiltersChange}
        excludeFields={["topics"]}
      />
    </QueryClientProvider>,
  )

  return onFiltersChange
}

describe("FiltersBuilderFields", () => {
  it("shows exact session ID filters and lets users remove one", () => {
    const onFiltersChange = renderFilters({
      sessionId: [{ op: "in", value: ["session-a", "session-b"] }],
    })

    expect(screen.getByRole("button", { name: "Session ID" }).getAttribute("aria-expanded")).toBe("true")
    expect(screen.queryByText("session-a")).not.toBeNull()
    expect(screen.queryByText("session-b")).not.toBeNull()

    const firstChip = screen.getByText("session-a").closest("[data-slot='combobox-chip']")
    const removeButton = firstChip?.querySelector("button")
    expect(removeButton).toBeInstanceOf(HTMLButtonElement)
    fireEvent.click(removeButton as HTMLButtonElement)

    expect(onFiltersChange).toHaveBeenCalledWith({
      sessionId: [{ op: "in", value: ["session-b"] }],
    })
  })

  it("keeps substring session ID filters editable as text", () => {
    renderFilters({ sessionId: [{ op: "contains", value: "session-prefix" }] })

    expect(screen.getByRole("button", { name: "Session ID" }).getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByPlaceholderText<HTMLInputElement>("Filter by session...").value).toBe("session-prefix")
  })
})
