/** Safari refuses to allocate a canvas backing store beyond this, returning a blank surface. */
export const MAX_CANVAS_PIXELS = 16_777_216

/** Beyond 2x the extra detail is not perceptible and the memory cost quadruples. */
const MAX_DEVICE_PIXEL_RATIO = 2

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const

export const MIN_ZOOM = ZOOM_STEPS[0]
export const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1] as number

export function computePixelRatio({
  cssWidth,
  cssHeight,
  devicePixelRatio,
}: {
  readonly cssWidth: number
  readonly cssHeight: number
  readonly devicePixelRatio: number
}): number {
  const capped = Math.min(Math.max(devicePixelRatio, 1), MAX_DEVICE_PIXEL_RATIO)
  const area = cssWidth * cssHeight
  if (area <= 0) return capped
  return Math.min(capped, Math.sqrt(MAX_CANVAS_PIXELS / area))
}

export function fitWidthScale({
  containerWidth,
  pageWidth,
}: {
  readonly containerWidth: number
  readonly pageWidth: number
}): number {
  if (containerWidth <= 0 || pageWidth <= 0) return 1
  return containerWidth / pageWidth
}

export function nextZoom(current: number, direction: "in" | "out"): number {
  if (direction === "in") {
    return ZOOM_STEPS.find((step) => step > current + 1e-6) ?? MAX_ZOOM
  }
  return [...ZOOM_STEPS].reverse().find((step) => step < current - 1e-6) ?? MIN_ZOOM
}

export function clampPage(page: number, numPages: number): number {
  if (numPages <= 0) return 1
  if (!Number.isFinite(page)) return 1
  return Math.min(Math.max(Math.round(page), 1), numPages)
}

/** Quantized so a resize drag re-renders a handful of times instead of once per observer tick. */
export function quantizeWidth(width: number, step = 16): number {
  if (width <= 0) return 0
  return Math.round(width / step) * step
}
