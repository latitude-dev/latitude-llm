const STORAGE_KEY_PREFIX = "latitude:last-project-slug:"

function readLastProjectSlug(organizationId: string): string | null {
  if (typeof localStorage === "undefined") return null
  try {
    return localStorage.getItem(`${STORAGE_KEY_PREFIX}${organizationId}`)
  } catch {
    return null
  }
}

export function writeLastProjectSlug(organizationId: string, projectSlug: string): void {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${organizationId}`, projectSlug)
  } catch {
    // ignore quota / private mode
  }
}

/** Prefer stored slug when it still exists; otherwise first project in the given order. */
export function pickProjectSlugForHome(
  organizationId: string,
  projects: ReadonlyArray<{ slug: string }>,
): string | null {
  if (projects.length === 0) return null
  const stored = readLastProjectSlug(organizationId)
  if (stored && projects.some((p) => p.slug === stored)) return stored
  return projects[0]?.slug ?? null
}
