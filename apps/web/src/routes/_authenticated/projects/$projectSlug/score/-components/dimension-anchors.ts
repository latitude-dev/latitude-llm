/** Anchors shared by the jump bar, the summary rows, and the sections they scroll to. */
export const dimensionAnchorId = (key: string): string => `dimension-${key}`

export const scrollToDimension = (key: string): void => {
  document.getElementById(dimensionAnchorId(key))?.scrollIntoView({ behavior: "smooth", block: "start" })
}
