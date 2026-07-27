import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { Part } from "../part.tsx"

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
    const globals = globalThis as { location?: { origin: string } | undefined }
    const original = globals.location
    globals.location = { origin: "https://app.latitude.so" }

    try {
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
    } finally {
      globals.location = original
    }
  })
})
