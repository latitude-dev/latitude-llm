// @vitest-environment jsdom
import { act, useRef } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useHasBeenInView } from "./use-has-been-in-view.ts"

type Entries = readonly { readonly isIntersecting: boolean }[]

let notify: ((entries: Entries) => void) | null = null
let observed: unknown[] = []
const disconnect = vi.fn()

class FakeObserver {
  root: unknown
  constructor(callback: (entries: Entries) => void, options?: { root?: unknown }) {
    notify = callback
    this.root = options?.root ?? null
  }
  observe(target: unknown) {
    observed.push(target)
  }
  unobserve() {}
  disconnect = disconnect
  takeRecords() {
    return []
  }
}

function Probe({ attachRef = true }: { readonly attachRef?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const seen = useHasBeenInView(ref)
  return <div ref={attachRef ? ref : null} data-seen={String(seen)} />
}

async function mount(node: React.ReactNode) {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(node))
  return {
    seen: () => container.firstElementChild?.getAttribute("data-seen"),
    unmount: () => act(async () => root.unmount()),
  }
}

describe("useHasBeenInView", () => {
  beforeEach(() => {
    notify = null
    observed = []
    disconnect.mockClear()
    vi.stubGlobal("IntersectionObserver", FakeObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("starts false and latches on the first intersection", async () => {
    const probe = await mount(<Probe />)
    expect(probe.seen()).toBe("false")

    await act(async () => notify?.([{ isIntersecting: true }]))
    expect(probe.seen()).toBe("true")

    await probe.unmount()
  })

  it("stays true once seen, so a lazy render is never unloaded", async () => {
    const probe = await mount(<Probe />)

    await act(async () => notify?.([{ isIntersecting: true }]))
    await act(async () => notify?.([{ isIntersecting: false }]))

    expect(probe.seen()).toBe("true")
    await probe.unmount()
  })

  it("stops observing once seen", async () => {
    const probe = await mount(<Probe />)
    expect(disconnect).not.toHaveBeenCalled()

    await act(async () => notify?.([{ isIntersecting: true }]))

    expect(disconnect).toHaveBeenCalled()
    await probe.unmount()
  })

  it("stays false while there is no element to observe", async () => {
    const probe = await mount(<Probe attachRef={false} />)

    expect(probe.seen()).toBe("false")
    expect(observed).toHaveLength(0)

    await probe.unmount()
  })

  it("treats a missing IntersectionObserver as visible", async () => {
    vi.stubGlobal("IntersectionObserver", undefined)

    const probe = await mount(<Probe />)

    expect(probe.seen()).toBe("true")
    await probe.unmount()
  })
})
