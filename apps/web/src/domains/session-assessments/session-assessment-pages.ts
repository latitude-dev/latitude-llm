import type { SessionAssessment } from "@domain/agent-score"

export function mergeSessionAssessmentPages(
  pages: readonly SessionAssessment[] | undefined,
): SessionAssessment | undefined {
  const firstPage = pages?.[0]
  if (!firstPage) return undefined
  const lastPage = pages[pages.length - 1] ?? firstPage

  return {
    ...firstPage,
    items: pages.flatMap((page) => page.items),
    ...(lastPage.nextCursor ? { nextCursor: lastPage.nextCursor } : { nextCursor: undefined }),
  }
}
