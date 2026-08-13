// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it } from "vitest"

import { DateRangePicker } from "./date-range-picker.tsx"

const mountedRoots: Array<{ root: ReturnType<typeof createRoot>; host: HTMLDivElement }> = []

async function renderOpenPicker(portalTarget?: "local" | "body") {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root = createRoot(host)
  mountedRoots.push({ root, host })

  await act(async () => {
    root.render(
      <DateRangePicker
        value={undefined}
        selectedPresetId={undefined}
        {...(portalTarget ? { portalTarget } : {})}
        onChange={() => undefined}
      />,
    )
  })

  const wrapper = host.firstElementChild
  const trigger = wrapper?.querySelector("button")
  expect(wrapper).toBeInstanceOf(HTMLDivElement)
  expect(trigger).toBeInstanceOf(HTMLButtonElement)

  await act(async () => {
    trigger?.click()
  })

  const popover = document.querySelector('[data-state="open"][data-side]')
  expect(popover).toBeInstanceOf(HTMLDivElement)

  return { popover: popover as HTMLDivElement, wrapper: wrapper as HTMLDivElement }
}

afterEach(async () => {
  for (const { root, host } of mountedRoots.splice(0)) {
    await act(async () => root.unmount())
    host.remove()
  }
})

describe("DateRangePicker portal target", () => {
  it("renders the popover under the local wrapper by default", async () => {
    const { popover, wrapper } = await renderOpenPicker()

    expect(wrapper.contains(popover)).toBe(true)
  })

  it("renders the popover under document.body outside the local wrapper", async () => {
    const { popover, wrapper } = await renderOpenPicker("body")

    expect(document.body.contains(popover)).toBe(true)
    expect(wrapper.contains(popover)).toBe(false)
  })
})
