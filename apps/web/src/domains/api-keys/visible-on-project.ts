/** Keys shown on a project settings page: this project's keys plus org-wide keys (`projectId === null`). */
export function apiKeysVisibleOnProject<T extends { readonly projectId: string | null }>(
  keys: readonly T[],
  projectId: string | null,
): T[] {
  return keys.filter((key) => key.projectId === null || key.projectId === projectId)
}
