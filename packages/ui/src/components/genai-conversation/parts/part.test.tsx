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
    expect(markup).toContain('aria-label="Preview PDF"')
    expect(markup).toContain('aria-label="Download PDF"')
    expect(markup).toContain("data:application/pdf;base64,JVBERi0=")
    expect(markup).not.toContain("Image unavailable")
    expect(markup).not.toContain("<img")
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
  })
})
