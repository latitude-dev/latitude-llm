import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { PdfViewerToolbar } from "./pdf-viewer-toolbar.tsx"

const noop = () => {}

const baseProps = {
  pageNumber: 1,
  numPages: 12,
  zoomPercent: 100,
  canZoomIn: true,
  canZoomOut: true,
  isFitWidth: true,
  onPrev: noop,
  onNext: noop,
  onZoomIn: noop,
  onZoomOut: noop,
  onFitWidth: noop,
}

/** Reads the `disabled` attribute off one button's open tag; "disabled" also occurs in classes. */
function isDisabled(markup: string, label: string): boolean {
  const segment = markup.split("<button").find((part) => part.includes(`aria-label="${label}"`)) ?? ""
  return segment.slice(0, segment.indexOf(">")).includes('disabled=""')
}

describe("PdfViewerToolbar", () => {
  it("shows the page readout", () => {
    expect(renderToStaticMarkup(<PdfViewerToolbar {...baseProps} />)).toContain("1 / 12")
  })

  it("disables page navigation at the bounds", () => {
    const first = renderToStaticMarkup(<PdfViewerToolbar {...baseProps} pageNumber={1} />)
    expect(isDisabled(first, "Previous page")).toBe(true)
    expect(isDisabled(first, "Next page")).toBe(false)

    const last = renderToStaticMarkup(<PdfViewerToolbar {...baseProps} pageNumber={12} />)
    expect(isDisabled(last, "Next page")).toBe(true)
    expect(isDisabled(last, "Previous page")).toBe(false)
  })

  it("reflects the fit-width toggle state", () => {
    expect(renderToStaticMarkup(<PdfViewerToolbar {...baseProps} isFitWidth />)).toContain('aria-pressed="true"')
    expect(renderToStaticMarkup(<PdfViewerToolbar {...baseProps} isFitWidth={false} />)).toContain(
      'aria-pressed="false"',
    )
  })

  it("disables zoom controls at the bounds", () => {
    const markup = renderToStaticMarkup(<PdfViewerToolbar {...baseProps} canZoomOut={false} />)
    expect(markup).toMatch(/aria-label="Zoom out"[^>]*disabled|disabled[^>]*aria-label="Zoom out"/)
  })

  it("only renders download and open actions when a source is available", () => {
    expect(renderToStaticMarkup(<PdfViewerToolbar {...baseProps} />)).not.toContain('aria-label="Download PDF"')

    const withActions = renderToStaticMarkup(
      <PdfViewerToolbar {...baseProps} downloadHref="blob:x" downloadName="a.pdf" openHref="blob:x" />,
    )
    expect(withActions).toContain('aria-label="Download PDF"')
    expect(withActions).toContain('aria-label="Open PDF in new tab"')
    expect(withActions).toMatch(/aria-label="Download PDF"[^>]*focus-visible:ring-2/)
    expect(withActions).toMatch(/aria-label="Open PDF in new tab"[^>]*focus-visible:ring-2/)
  })
})
