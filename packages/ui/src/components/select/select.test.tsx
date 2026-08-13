// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it } from "vitest"

import { Select } from "./index.tsx"

const mountedRoots: Array<{ root: ReturnType<typeof createRoot>; host: HTMLDivElement }> = []

async function renderOpenSelect(portalTarget?: "local" | "body") {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root = createRoot(host)
  mountedRoots.push({ root, host })

  await act(async () => {
    root.render(
      <Select
        name="add-filter"
        searchable
        value={undefined}
        options={[
          { value: "status", label: "Status" },
          { value: "userId", label: "User" },
        ]}
        {...(portalTarget ? { portalTarget } : {})}
        onChange={() => undefined}
      />,
    )
  })

  const trigger = host.querySelector("[aria-expanded]")
  expect(trigger).toBeInstanceOf(HTMLElement)

  await act(async () => {
    trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  })

  const popover = document.querySelector("[data-slot='searchable-select-content']")
  expect(popover).toBeInstanceOf(HTMLDivElement)

  return { popover: popover as HTMLDivElement, host }
}

afterEach(async () => {
  for (const { root, host } of mountedRoots.splice(0)) {
    await act(async () => root.unmount())
    host.remove()
  }
})

describe("Select searchable portal target", () => {
  it("renders the popover under the local wrapper by default", async () => {
    const { popover, host } = await renderOpenSelect()

    expect(host.contains(popover)).toBe(true)
  })

  it("renders the popover under document.body outside the local wrapper", async () => {
    const { popover, host } = await renderOpenSelect("body")

    expect(document.body.contains(popover)).toBe(true)
    expect(host.contains(popover)).toBe(false)
  })
})
