import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { FileCard } from "./file-card.tsx"

const noop = () => {}

describe("FileCard activation", () => {
  it("makes the whole card a labelled click target when activatable", () => {
    const markup = renderToStaticMarkup(
      <FileCard mimeType="application/pdf" onActivate={noop} activateLabel="Open PDF preview" />,
    )

    expect(markup).toContain('aria-label="Open PDF preview"')
    expect(markup).toContain("cursor-pointer")
    expect(markup).toContain("hover:bg-muted")
  })

  it("offers no click target when not activatable, as for an unreadable document", () => {
    const markup = renderToStaticMarkup(<FileCard mimeType="application/pdf" />)

    // The card's own actions may still render; only the stretched overlay must be gone.
    expect(markup).not.toContain('aria-label="Open PDF preview"')
    expect(markup).not.toContain("absolute inset-0")
    expect(markup).not.toContain("cursor-pointer")
    expect(markup).not.toContain("hover:bg-muted")
  })

  it("keeps the built-in actions above the overlay so they stay clickable", () => {
    const markup = renderToStaticMarkup(
      <FileCard
        mimeType="application/pdf"
        downloadDataUri="data:application/pdf;base64,JVBERi0="
        onActivate={noop}
        activateLabel="Open PDF preview"
      />,
    )

    expect(markup).toContain('aria-label="Download PDF"')
    expect(markup).toContain("relative z-1")
  })
})
