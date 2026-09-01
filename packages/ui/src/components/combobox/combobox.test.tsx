// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it } from "vitest"

import { Combobox, ComboboxContent, ComboboxItem, ComboboxList, ComboboxTrigger } from "./combobox.tsx"

const mountedRoots: Array<{ root: ReturnType<typeof createRoot>; host: HTMLDivElement }> = []
const extraNodes: HTMLDivElement[] = []

async function renderOpenCombobox(container?: HTMLElement) {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root = createRoot(host)
  mountedRoots.push({ root, host })

  await act(async () => {
    root.render(
      <Combobox defaultOpen items={["status"]} itemToStringValue={(value: string) => value}>
        <ComboboxTrigger>Open</ComboboxTrigger>
        <ComboboxContent {...(container ? { container } : {})}>
          <ComboboxList>
            {(value: string) => (
              <ComboboxItem key={value} value={value}>
                {value}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>,
    )
  })

  const popover = document.querySelector("[data-slot='combobox-content']")
  expect(popover).toBeInstanceOf(HTMLDivElement)

  return { popover: popover as HTMLDivElement, host }
}

afterEach(async () => {
  for (const { root, host } of mountedRoots.splice(0)) {
    await act(async () => root.unmount())
    host.remove()
  }
  for (const node of extraNodes.splice(0)) {
    node.remove()
  }
})

describe("ComboboxContent portal target", () => {
  it("renders the popup under document.body by default", async () => {
    const { popover, host } = await renderOpenCombobox()

    expect(document.body.contains(popover)).toBe(true)
    expect(host.contains(popover)).toBe(false)
  })

  it("renders the popup under an explicit container", async () => {
    const local = document.createElement("div")
    document.body.appendChild(local)
    extraNodes.push(local)

    const { popover } = await renderOpenCombobox(local)

    expect(local.contains(popover)).toBe(true)
  })
})
