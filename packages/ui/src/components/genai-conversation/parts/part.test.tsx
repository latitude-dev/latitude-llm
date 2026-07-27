// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { Part } from "../part.tsx"

async function renderPdfUriOnClient(uri: string) {
  const container = document.createElement("div")
  const root = createRoot(container)

  try {
    await act(async () => {
      root.render(
        <Part
          part={{
            type: "uri",
            modality: "document",
            mime_type: "application/pdf",
            uri,
          }}
        />,
      )
    })

    return container.innerHTML
  } finally {
    await act(async () => root.unmount())
  }
}

describe("Part media / file rendering", () => {
  it("renders a PDF blob as a file card even when modality is wrongly image", () => {
    const markup = renderToStaticMarkup(
      <Part
        part={{
          type: "blob",
          modality: "image",
          mime_type: "application/pdf",
          content: "JVBERi0=",
        }}
      />,
    )

    expect(markup).toContain("PDF document")
    expect(markup).toContain('aria-label="Download PDF"')
    expect(markup).not.toContain('aria-label="Preview PDF"')
    expect(markup).toContain("data:application/pdf;base64,JVBERi0=")
    expect(markup).not.toContain("Image unavailable")
    expect(markup).not.toContain("<img")
    // The expand control is eager so it survives SSR; the viewer behind it must not.
    expect(markup).toContain('aria-label="Open PDF preview"')
    expect(markup).not.toContain("<canvas")
    expect(markup).not.toContain("blob:")
    // The preview is a header inside the file card, not a second card beside it.
    expect(markup.match(/max-w-md/g)).toHaveLength(1)
  })

  it("still renders real image blobs as images", () => {
    const markup = renderToStaticMarkup(
      <Part
        part={{
          type: "blob",
          modality: "image",
          mime_type: "image/png",
          content: "aGVsbG8=",
        }}
      />,
    )

    expect(markup).toContain("<img")
    expect(markup).toContain("data:image/png;base64,aGVsbG8=")
    expect(markup).not.toContain("PDF document")
  })

  it("renders a linked PDF uri with preview only (cross-origin download is unreliable)", () => {
    const markup = renderToStaticMarkup(
      <Part
        part={{
          type: "uri",
          modality: "document",
          mime_type: "application/pdf",
          uri: "https://docs.latitude.so/guide.pdf",
        }}
      />,
    )

    expect(markup).toContain("guide.pdf")
    expect(markup).toContain('aria-label="Preview PDF"')
    expect(markup).not.toContain('aria-label="Download PDF"')
    // pdf.js could not fetch a cross-origin PDF, so no inline preview is offered.
    expect(markup).not.toContain('aria-label="Open PDF preview"')
  })

  it("keeps same-origin PDF uri markup stable until hydration completes", () => {
    const markup = renderToStaticMarkup(
      <Part
        part={{
          type: "uri",
          modality: "document",
          mime_type: "application/pdf",
          uri: "/attachments/guide.pdf",
        }}
      />,
    )

    expect(markup).toContain('aria-label="Preview PDF"')
    expect(markup).not.toContain('aria-label="Open PDF preview"')
  })

  it("enables the inline preview for a same-origin PDF uri after mounting", async () => {
    const markup = await renderPdfUriOnClient("/attachments/guide.pdf")

    expect(markup).toContain('aria-label="Open PDF preview"')
  })

  it("keeps a cross-origin PDF uri non-interactive after mounting", async () => {
    const markup = await renderPdfUriOnClient("https://docs.latitude.so/guide.pdf")

    expect(markup).not.toContain('aria-label="Open PDF preview"')
  })
})
