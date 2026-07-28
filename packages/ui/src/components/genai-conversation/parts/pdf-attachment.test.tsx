// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PREVIEW_HEIGHT } from "../../pdf/pdf-render-math.ts"

type PreviewProps = {
  readonly url: string | null
  readonly showThumbnail: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onUnavailable?: (() => void) | undefined
}

const captured = vi.hoisted(() => ({ props: null as PreviewProps | null }))

// Stands in for the pdf.js chunk: the point of the gate is that this never mounts unless asked for.
vi.mock("../../pdf/lazy-pdf-preview.tsx", async () => {
  const { createElement } = await import("react")
  return {
    LazyPdfPreview: (props: PreviewProps) => {
      captured.props = props
      return createElement("div", {
        "data-testid": "preview",
        "data-thumbnail": String(props.showThumbnail),
        "data-url": props.url ?? "",
      })
    },
  }
})

const { PdfAttachment } = await import("./pdf-attachment.tsx")

type Entries = readonly { readonly isIntersecting: boolean }[]

let notify: ((entries: Entries) => void) | null = null
let createObjectUrl: ReturnType<typeof vi.fn>
let revokeObjectUrl: ReturnType<typeof vi.fn>

// Assigned directly because jsdom leaves these undefined, which rules out vi.spyOn.
const originalCreateObjectUrl = URL.createObjectURL
const originalRevokeObjectUrl = URL.revokeObjectURL

class FakeObserver {
  constructor(callback: (entries: Entries) => void) {
    notify = callback
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

const SMALL_PDF = { base64: "JVBERi0=", sizeBytes: 1024 }
const LARGE_PDF = { base64: "JVBERi0=", sizeBytes: 20 * 1024 * 1024 }

async function mount(node: React.ReactNode) {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(node))

  return {
    html: () => container.innerHTML,
    preview: () => container.querySelector("[data-testid='preview']"),
    openButton: () => container.querySelector<HTMLButtonElement>("[aria-label='Open PDF preview']"),
    unmount: () => act(async () => root.unmount()),
  }
}

const scrollIntoView = () => act(async () => notify?.([{ isIntersecting: true }]))

describe("PdfAttachment loading gate", () => {
  beforeEach(() => {
    notify = null
    captured.props = null
    let issued = 0
    createObjectUrl = vi.fn(() => `blob:pdf-${++issued}`)
    revokeObjectUrl = vi.fn()
    URL.createObjectURL = createObjectUrl as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = revokeObjectUrl as unknown as typeof URL.revokeObjectURL
    vi.stubGlobal("IntersectionObserver", FakeObserver)
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ blob: async () => new Blob(["%PDF"]) })),
    )
  })

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectUrl
    URL.revokeObjectURL = originalRevokeObjectUrl
    vi.unstubAllGlobals()
  })

  it("decodes nothing until the card is scrolled to", async () => {
    const card = await mount(<PdfAttachment mimeType="application/pdf" {...SMALL_PDF} />)

    expect(card.preview()).toBeNull()
    expect(card.html()).toContain(`${PREVIEW_HEIGHT}px`)
    expect(createObjectUrl).not.toHaveBeenCalled()

    await card.unmount()
  })

  it("renders the thumbnail once the card is scrolled to", async () => {
    const card = await mount(<PdfAttachment mimeType="application/pdf" {...SMALL_PDF} />)

    await scrollIntoView()

    expect(card.preview()?.getAttribute("data-thumbnail")).toBe("true")
    expect(createObjectUrl).toHaveBeenCalledTimes(1)
    expect(card.preview()?.getAttribute("data-url")).toBe("blob:pdf-1")

    await card.unmount()
  })

  it("never auto-decodes a document past the size guard", async () => {
    const card = await mount(<PdfAttachment mimeType="application/pdf" {...LARGE_PDF} />)

    await scrollIntoView()

    expect(card.preview()).toBeNull()
    expect(card.html()).not.toContain(`${PREVIEW_HEIGHT}px`)
    expect(createObjectUrl).not.toHaveBeenCalled()

    await act(async () => card.openButton()?.click())

    expect(card.preview()?.getAttribute("data-thumbnail")).toBe("false")
    expect(createObjectUrl).toHaveBeenCalledTimes(1)

    await card.unmount()
  })

  it("keeps the object URL alive across a modal close, so reopening still loads", async () => {
    const card = await mount(<PdfAttachment mimeType="application/pdf" {...LARGE_PDF} />)

    await act(async () => card.openButton()?.click())
    const firstUrl = card.preview()?.getAttribute("data-url")

    await act(async () => captured.props?.onOpenChange(false))

    expect(revokeObjectUrl).not.toHaveBeenCalled()
    expect(card.preview()).toBeNull()

    await act(async () => card.openButton()?.click())

    expect(card.preview()?.getAttribute("data-url")).toBe(firstUrl)
    expect(createObjectUrl).toHaveBeenCalledTimes(1)

    await card.unmount()
  })

  it("drops the open affordance for an unreadable document", async () => {
    const card = await mount(<PdfAttachment mimeType="application/pdf" {...SMALL_PDF} />)

    await scrollIntoView()
    await act(async () => captured.props?.onUnavailable?.())

    expect(card.openButton()).toBeNull()

    await card.unmount()
  })
})
