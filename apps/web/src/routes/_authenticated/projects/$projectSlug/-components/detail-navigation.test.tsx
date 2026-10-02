// @vitest-environment jsdom

import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DetailFilterTags } from "./detail-filter-tags.tsx"
import { MetadataJson } from "./metadata-json.tsx"
import { UserSessionsLink } from "./user-sessions-link.tsx"

afterEach(cleanup)

describe("metadata links", () => {
  it("links nested URL values while preserving JSON text and leaving keys and unsafe values as text", () => {
    const value = {
      "https://example.com/key": "plain text",
      nested: { chat: "https://example.com/chat?q=a&b=two", unsafe: "javascript:alert(1)" },
      items: ["http://example.com/path", "https://", "not a URL", "https://example.com/a\\b"],
    }
    const { container } = render(<MetadataJson value={value} />)
    expect(container.querySelector("pre")?.textContent).toBe(JSON.stringify(value, null, 2))
    const links = screen.getAllByRole("link")
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "https://example.com/chat?q=a&b=two",
      "http://example.com/path",
      "https://example.com/a\\b",
    ])
    fireEvent.click(screen.getByRole("button", { name: "Expand metadata" }))
    expect(screen.getByRole("dialog").querySelectorAll("a")).toHaveLength(3)
    for (const link of links) {
      expect(link.getAttribute("target")).toBe("_blank")
      expect(link.getAttribute("rel")).toBe("noopener noreferrer")
    }
  })
})

describe("tag filters", () => {
  it("preserves other filters and existing tag conditions without adding duplicates", () => {
    const filters = {
      userId: [{ op: "eq" as const, value: "user-1" }],
      tags: [{ op: "contains" as const, value: "support" }],
    }
    const onFiltersChange = vi.fn()
    const { rerender } = render(
      <DetailFilterTags tags={["production"]} filters={filters} onFiltersChange={onFiltersChange} />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Filter by tag production" }))
    const next = onFiltersChange.mock.calls[0]?.[0]
    expect(next).toEqual({ ...filters, tags: [...filters.tags, { op: "contains", value: "production" }] })
    expect(filters.tags).toHaveLength(1)
    rerender(<DetailFilterTags tags={["production"]} filters={next} onFiltersChange={onFiltersChange} />)
    fireEvent.click(screen.getByRole("button", { name: "Filter by tag production" }))
    expect(onFiltersChange).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Filter by tag production" }).hasAttribute("disabled")).toBe(true)
  })

  it("leaves tags informational when there is no filtering callback", () => {
    render(<DetailFilterTags tags={["support"]} />)
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.getByText("support")).toBeDefined()
  })
})

it("disables tag actions at the filter limit", () => {
  const onFiltersChange = vi.fn()
  render(
    <DetailFilterTags
      tags={["extra"]}
      filters={{ tags: Array.from({ length: 10 }, (_, i) => ({ op: "contains", value: `tag-${i}` })) }}
      onFiltersChange={onFiltersChange}
    />,
  )
  const button = screen.getByRole("button", { name: "Filter by tag extra" })
  expect(button.hasAttribute("disabled")).toBe(true)
  fireEvent.click(button)
  expect(onFiltersChange).not.toHaveBeenCalled()
})

it("links to all user sessions without carrying a selected chat, time range, or search", async () => {
  const rootRoute = createRootRoute()
  const projectRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectSlug",
    component: () => <UserSessionsLink userId="user@example.com" />,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([projectRoute]),
    history: createMemoryHistory({ initialEntries: ["/projects/sample?sessionId=old&query=error"] }),
  })
  await router.load()
  render(<RouterProvider router={router} />)
  const link = await screen.findByRole("link", { name: "View all sessions for this user" })
  const url = new URL(link.getAttribute("href") ?? "", "https://latitude.test")
  expect(url.pathname).toBe("/projects/sample")
  expect(url.searchParams.get("tab")).toBe("sessions")
  const raw = JSON.parse(url.searchParams.get("filters") ?? "{}")
  expect(typeof raw === "string" ? JSON.parse(raw) : raw).toEqual({ userId: [{ op: "eq", value: "user@example.com" }] })
  expect(url.searchParams.has("sessionId")).toBe(false)
  expect(url.searchParams.has("query")).toBe(false)
})
